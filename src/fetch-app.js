import { createAdminRouteHandler } from "./admin/index.js";
import { createConfig } from "./config.js";
import { chargeRequiredResponse, jsonResponse, parsePaging, readJsonBody } from "./http-helpers.js";
import { createMailBackendAdapter } from "./mail-backend/index.js";
import { createPaymentVerifier } from "./payment.js";
import { createInternalRouteHandler } from "./internal/index.js";
import { createRequestAuth } from "./request-auth.js";
import { createRuntimeSettingsManager } from "./runtime-settings.js";
import { createSiweService } from "./siwe.js";
import { renderAdminDashboardHtml } from "./admin-ui.js";
import { renderAgentsGuideHtml } from "./agents-guide-ui.js";
import { renderUserAppHtml } from "./user-ui.js";
import { getDefaultStore } from "./store.js";
import { createRequestId } from "./utils.js";
import { createV1RouteHandler } from "./v1/index.js";
import { createV1SystemRouteHandler } from "./v1/system-routes.js";
import { createV2RouteHandler } from "./v2/index.js";
import { createWebhookDispatcher } from "./webhook-dispatcher.js";

export function createFetchApp(deps = {}) {
  const runtimeConfig = deps.config || createConfig(process.env);
  const store = deps.store || getDefaultStore();
  const runtimeSettings = createRuntimeSettingsManager({
    store,
    overageChargeUsdc: runtimeConfig.overageChargeUsdc,
    agentAllocateHourlyLimit: runtimeConfig.agentAllocateHourlyLimit,
  });
  const paymentVerifier =
    deps.paymentVerifier ||
    createPaymentVerifier({
      mode: runtimeConfig.paymentMode,
      hmacSecret: runtimeConfig.paymentHmacSecret,
      hmacSkewSec: runtimeConfig.paymentHmacSkewSec,
    });
  const siweService =
    deps.siweService ||
    createSiweService({
      mode: runtimeConfig.siweMode,
      chainId: runtimeConfig.baseChainId,
      domain: runtimeConfig.siweDomain,
      uri: runtimeConfig.siweUri,
      statement: runtimeConfig.siweStatement,
    });
  const mailBackend = deps.mailBackend || deps.mailProvider || createMailBackendAdapter(runtimeConfig);
  const webhookDispatcher =
    deps.webhookDispatcher ||
    createWebhookDispatcher({
      secretEncryptionKey: runtimeConfig.webhookSecretEncryptionKey,
      timeoutMs: runtimeConfig.webhookTimeoutMs,
      retryAttempts: runtimeConfig.webhookRetryAttempts,
    });
  const paidBypassTargets = new Set([
    "POST /v1/mailboxes/allocate",
    "POST /v1/messages/send",
    "GET /v1/messages/latest",
    "POST /v2/messages/send",
    "POST /v1/webhooks",
    "POST /v2/mailboxes/leases",
    "POST /v2/webhooks",
  ]);
  const requestAuth = createRequestAuth({
    store,
    runtimeConfig,
    paymentVerifier,
    jsonResponse,
    chargeRequiredResponse,
    paidBypassTargets,
    getOverageChargeUsdc,
    getAgentAllocateHourlyLimit,
  });
  const { requireAuth, requireAdminAuth, requireInternalAuth, evaluateAccess } = requestAuth;
  const handleInternalRoute = createInternalRouteHandler({
    store,
    requireInternalAuth,
    jsonResponse,
    readJsonBody,
    webhookDispatcher,
  });
  const handleV2Route = createV2RouteHandler({
    store,
    mailBackend,
    requireAuth,
    evaluateAccess,
    jsonResponse,
    readJsonBody,
    getOverageChargeUsdc,
  });
  const handleAdminRoute = createAdminRouteHandler({
    store,
    requireAdminAuth,
    jsonResponse,
    readJsonBody,
    parsePaging,
    getOverageChargeUsdc,
    getAgentAllocateHourlyLimit,
    async updateRuntimeSettings({ overageChargeUsdc, agentAllocateHourlyLimit }) {
      await runtimeSettings.update({ overageChargeUsdc, agentAllocateHourlyLimit });
    },
  });
  const handleV1Route = createV1RouteHandler({
    store,
    mailBackend,
    requireAuth,
    evaluateAccess,
    jsonResponse,
    readJsonBody,
    getOverageChargeUsdc,
  });
  const handleV1SystemRoute = createV1SystemRouteHandler({
    store,
    runtimeConfig,
    siweService,
    requireAuth,
    jsonResponse,
    readJsonBody,
    paidBypassTargets,
    getOverageChargeUsdc,
  });

  function getOverageChargeUsdc() {
    return runtimeSettings.getOverageChargeUsdc();
  }

  function getAgentAllocateHourlyLimit() {
    return runtimeSettings.getAgentAllocateHourlyLimit();
  }

  return async function handleRequest(request) {
    const requestId = createRequestId();
    const method = request.method || "GET";
    const requestUrl = new URL(request.url);
    const path = requestUrl.pathname;

    try {
      await runtimeSettings.ensureLoaded();

      if (method === "GET" && path === "/healthz") {
        return jsonResponse(200, { status: "ok", service: "agent-mail-cloud" }, requestId);
      }

      if (method === "GET" && path === "/v1/meta/runtime") {
        return jsonResponse(
          200,
          {
            siwe_mode: runtimeConfig.siweMode,
            payment_mode: runtimeConfig.paymentMode,
            base_chain_id: runtimeConfig.baseChainId,
            chain_name: runtimeConfig.chainName,
            chain_hex: `0x${Number(runtimeConfig.baseChainId || 0).toString(16)}`,
            chain_rpc_urls: runtimeConfig.chainRpcUrls,
            chain_explorer_urls: runtimeConfig.chainExplorerUrls,
            mailbox_domain: runtimeConfig.mailboxDomain,
            overage_charge_usdc: getOverageChargeUsdc(),
            agent_allocate_hourly_limit: getAgentAllocateHourlyLimit(),
            webmail_url: runtimeConfig.mailuBaseUrl ? `${runtimeConfig.mailuBaseUrl.replace(/\/$/, "")}/webmail/` : null,
            auth: {
              browser_wallet_required: runtimeConfig.siweMode === "strict",
            },
          },
          requestId,
        );
      }

      if (method === "GET" && (path === "/admin" || path === "/admin/")) {
        return new Response(renderAdminDashboardHtml({ adminTokenRequired: Boolean(runtimeConfig.adminApiToken) }), {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }

      if (method === "GET" && (path === "/app" || path === "/app/")) {
        return new Response(renderUserAppHtml(), {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }

      if (method === "GET" && (path === "/agents-guide" || path === "/agents-guide/")) {
        return new Response(renderAgentsGuideHtml(), {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }

      const v2Response = await handleV2Route({ method, path, request, requestId, requestUrl });
      if (v2Response) return v2Response;

      const adminResponse = await handleAdminRoute({ method, path, request, requestId, requestUrl });
      if (adminResponse) return adminResponse;
      const internalResponse = await handleInternalRoute({ method, path, request, requestId, requestUrl });
      if (internalResponse) return internalResponse;

      const v1SystemResponse = await handleV1SystemRoute({ method, path, request, requestId, requestUrl });
      if (v1SystemResponse) return v1SystemResponse;
      const v1Response = await handleV1Route({ method, path, request, requestId, requestUrl });
      if (v1Response) return v1Response;

      return jsonResponse(404, { error: "not_found", message: "Route not found" }, requestId);
    } catch (err) {
      if (err.message === "Invalid JSON") {
        return jsonResponse(400, { error: "bad_request", message: err.message }, requestId);
      }
      if (err.message === "Payload too large") {
        return jsonResponse(413, { error: "payload_too_large", message: err.message }, requestId);
      }
      if (err.code === "SIWE_UNAVAILABLE") {
        return jsonResponse(500, { error: "siwe_unavailable", message: err.message }, requestId);
      }

      return jsonResponse(
        500,
        {
          error: "internal_error",
          message: "Unexpected server error",
          detail: process.env.NODE_ENV === "production" ? undefined : err.message,
        },
        requestId,
      );
    }
  };
}
