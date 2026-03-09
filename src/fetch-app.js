import { verifyJwt } from "./auth.js";
import { createAdminRouteHandler } from "./admin/index.js";
import { createConfig } from "./config.js";
import { createMailBackendAdapter } from "./mail-backend/index.js";
import { createPaymentVerifier } from "./payment.js";
import { createInternalRouteHandler } from "./internal/index.js";
import { createSiweService } from "./siwe.js";
import { renderAdminDashboardHtml } from "./admin-ui.js";
import { renderAgentsGuideHtml } from "./agents-guide-ui.js";
import { renderUserAppHtml } from "./user-ui.js";
import { getDefaultStore } from "./store.js";
import { createRequestId, parseBearerToken } from "./utils.js";
import { createV1RouteHandler } from "./v1/index.js";
import { createV1SystemRouteHandler } from "./v1/system-routes.js";
import { createV2RouteHandler } from "./v2/index.js";
import { createWebhookDispatcher } from "./webhook-dispatcher.js";

function jsonResponse(status, payload, requestId) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "x-request-id": requestId,
  });
  return new Response(JSON.stringify(payload), { status, headers });
}

function parsePaging(requestUrl) {
  const page = Number(requestUrl.searchParams.get("page") || "1");
  const pageSize = Number(requestUrl.searchParams.get("page_size") || "20");
  if (!Number.isInteger(page) || page < 1) {
    return { ok: false, message: "page must be >= 1" };
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) {
    return { ok: false, message: "page_size must be 1..200" };
  }
  return { ok: true, page, pageSize };
}

function chargeRequiredResponse(requestId, amountUsdc, reasons) {
  return jsonResponse(
    402,
    {
      error: "payment_required",
      message: "Free limit reached; payment is required to continue",
      amount_usdc: amountUsdc,
      reasons,
    },
    requestId,
  );
}

async function readJsonBody(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON");
  }
}

export function createFetchApp(deps = {}) {
  const runtimeConfig = deps.config || createConfig(process.env);
  const runtimeSettings = {
    overageChargeUsdc: Number(runtimeConfig.overageChargeUsdc || 0.001),
    agentAllocateHourlyLimit: Number(runtimeConfig.agentAllocateHourlyLimit || 0),
  };
  let runtimeSettingsLoaded = false;
  const store = deps.store || getDefaultStore();
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
      runtimeSettings.overageChargeUsdc = overageChargeUsdc;
      runtimeSettings.agentAllocateHourlyLimit = agentAllocateHourlyLimit;
      if (typeof store.updateRuntimeSettings === "function") {
        await store.updateRuntimeSettings({
          overage_charge_usdc: runtimeSettings.overageChargeUsdc,
          agent_allocate_hourly_limit: runtimeSettings.agentAllocateHourlyLimit,
        });
      }
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
    return Number(runtimeSettings.overageChargeUsdc || 0);
  }

  function getAgentAllocateHourlyLimit() {
    return Number(runtimeSettings.agentAllocateHourlyLimit || 0);
  }

  async function ensureRuntimeSettingsLoaded() {
    if (runtimeSettingsLoaded) return;
    if (typeof store.getRuntimeSettings !== "function") return;
    const persisted = await store.getRuntimeSettings();
    if (persisted?.overage_charge_usdc != null) {
      runtimeSettings.overageChargeUsdc = Number(persisted.overage_charge_usdc);
    }
    if (persisted?.agent_allocate_hourly_limit != null) {
      runtimeSettings.agentAllocateHourlyLimit = Number(persisted.agent_allocate_hourly_limit);
    }
    runtimeSettingsLoaded = true;
  }

  async function requireAuth(request, requestId) {
    const token = parseBearerToken(request.headers.get("authorization"));
    if (!token) {
      return {
        ok: false,
        response: jsonResponse(401, { error: "unauthorized", message: "Unauthorized" }, requestId),
      };
    }

    try {
      const payload = verifyJwt(token, runtimeConfig.jwtSecret);
      const ctx = await store.findTenantContext(payload.tenant_id, payload.agent_id);
      if (!ctx) {
        return {
          ok: false,
          response: jsonResponse(
            403,
            { error: "forbidden", message: "Tenant/agent context not found" },
            requestId,
          ),
        };
      }
      if (ctx.tenant?.status && ctx.tenant.status !== "active") {
        return {
          ok: false,
          response: jsonResponse(
            403,
            { error: "tenant_inactive", message: `Tenant is ${ctx.tenant.status}` },
            requestId,
          ),
        };
      }
      if (ctx.agent?.status && ctx.agent.status !== "active") {
        return {
          ok: false,
          response: jsonResponse(
            403,
            { error: "agent_inactive", message: `Agent is ${ctx.agent.status}` },
            requestId,
          ),
        };
      }
      return { ok: true, payload };
    } catch (err) {
      return {
        ok: false,
        response: jsonResponse(401, { error: "unauthorized", message: err.message }, requestId),
      };
    }
  }

  function requireInternalAuth(request, requestId) {
    if (!runtimeConfig.internalApiToken) {
      return {
        ok: false,
        response: jsonResponse(
          500,
          { error: "internal_api_unconfigured", message: "INTERNAL_API_TOKEN is not configured" },
          requestId,
        ),
      };
    }

    const token =
      parseBearerToken(request.headers.get("authorization")) || request.headers.get("x-internal-token");
    if (!token || token !== runtimeConfig.internalApiToken) {
      return {
        ok: false,
        response: jsonResponse(401, { error: "unauthorized", message: "Invalid internal token" }, requestId),
      };
    }
    return { ok: true };
  }

  async function requireAdminAuth(request, requestId) {
    if (runtimeConfig.adminApiToken) {
      const token =
        parseBearerToken(request.headers.get("authorization")) || request.headers.get("x-admin-token");
      if (!token || token !== runtimeConfig.adminApiToken) {
        return {
          ok: false,
          response: jsonResponse(401, { error: "unauthorized", message: "Invalid admin token" }, requestId),
        };
      }
      return { ok: true, actorDid: "system:admin-token" };
    }

    const auth = await requireAuth(request, requestId);
    if (!auth.ok) return auth;
    return { ok: true, actorDid: auth.payload.did, payload: auth.payload };
  }

  function requirePayment(request, requestId) {
    const result = paymentVerifier.verify(request);
    if (!result.ok) {
      return {
        ok: false,
        response: jsonResponse(402, { error: result.code, message: result.message }, requestId),
      };
    }
    return { ok: true };
  }

  async function evaluateAccess({
    request,
    requestId,
    tenantId,
    agentId,
    endpoint,
    checkAllocateHourly = false,
    allocateHourlyEndpoints = ["POST /v1/mailboxes/allocate"],
  }) {
    const tenantPolicy = await store.getTenantPolicy(tenantId);
    if (!tenantPolicy) {
      return {
        ok: false,
        response: jsonResponse(403, { error: "forbidden", message: "Tenant not found" }, requestId),
      };
    }

    if (tenantPolicy.status !== "active") {
      return {
        ok: false,
        response: jsonResponse(403, { error: "tenant_inactive", message: `Tenant is ${tenantPolicy.status}` }, requestId),
      };
    }

    const reasons = [];
    const now = Date.now();
    const qpsLimit = Number(tenantPolicy.quotas?.qps || 0);
    if (qpsLimit > 0) {
      const recentCalls = await store.countTenantUsageSince(tenantId, new Date(now - 1000));
      if (recentCalls >= qpsLimit) {
        reasons.push({
          code: "tenant_qps",
          limit: qpsLimit,
          window: "1s",
        });
      }
    }

    const hourlyAllocateLimit = getAgentAllocateHourlyLimit();
    if (checkAllocateHourly && hourlyAllocateLimit > 0) {
      let recentAllocations = 0;
      for (const allocateEndpoint of allocateHourlyEndpoints) {
        recentAllocations += await store.countAgentEndpointUsageSince(
          tenantId,
          agentId,
          allocateEndpoint,
          new Date(now - 3600 * 1000),
        );
      }
      if (recentAllocations >= hourlyAllocateLimit) {
        reasons.push({
          code: "agent_allocate_hourly",
          limit: hourlyAllocateLimit,
          window: "1h",
        });
      }
    }

    if (!reasons.length) {
      return { ok: true, requiresCharge: false, reasons: [] };
    }

    if (!paidBypassTargets.has(endpoint)) {
      return {
        ok: false,
        response: jsonResponse(429, { error: "rate_limited", message: "Rate limit exceeded", reasons }, requestId),
      };
    }

    const pay = requirePayment(request, requestId);
    if (!pay.ok) {
      return {
        ok: false,
        response:
          pay.response?.status === 402
            ? chargeRequiredResponse(requestId, getOverageChargeUsdc(), reasons)
            : pay.response,
      };
    }

    return {
      ok: true,
      requiresCharge: true,
      reasons,
    };
  }

  return async function handleRequest(request) {
    const requestId = createRequestId();
    const method = request.method || "GET";
    const requestUrl = new URL(request.url);
    const path = requestUrl.pathname;

    try {
      await ensureRuntimeSettingsLoaded();

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
