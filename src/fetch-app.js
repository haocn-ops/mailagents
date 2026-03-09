import { createJwt, verifyJwt } from "./auth.js";
import { createConfig } from "./config.js";
import { createMailBackendAdapter } from "./mail-backend/index.js";
import { createInternalRouteHandler } from "./internal/index.js";
import { buildHmacPaymentProof, createPaymentVerifier } from "./payment.js";
import { createSiweService } from "./siwe.js";
import { renderAdminDashboardHtml } from "./admin-ui.js";
import { renderAgentsGuideHtml } from "./agents-guide-ui.js";
import { renderUserAppHtml } from "./user-ui.js";
import { getDefaultStore } from "./store.js";
import { createNonce, createRequestId, parseBearerToken } from "./utils.js";
import { createV1RouteHandler } from "./v1/index.js";
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
  const handleV1Route = createV1RouteHandler({
    store,
    mailBackend,
    requireAuth,
    evaluateAccess,
    jsonResponse,
    readJsonBody,
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

      if (method === "GET" && path === "/v1/admin/settings/limits") {
        const auth = await requireAdminAuth(request, requestId);
        if (!auth.ok) return auth.response;
        return jsonResponse(
          200,
          {
            overage_charge_usdc: getOverageChargeUsdc(),
            agent_allocate_hourly_limit: getAgentAllocateHourlyLimit(),
          },
          requestId,
        );
      }

      if (method === "PATCH" && path === "/v1/admin/settings/limits") {
        const auth = await requireAdminAuth(request, requestId);
        if (!auth.ok) return auth.response;
        const body = await readJsonBody(request);
        const nextOverage =
          body.overage_charge_usdc === undefined ? getOverageChargeUsdc() : Number(body.overage_charge_usdc);
        const nextAgentAllocateHourlyLimit =
          body.agent_allocate_hourly_limit === undefined
            ? getAgentAllocateHourlyLimit()
            : Number(body.agent_allocate_hourly_limit);

        if (!Number.isFinite(nextOverage) || nextOverage < 0) {
          return jsonResponse(400, { error: "bad_request", message: "overage_charge_usdc must be >= 0" }, requestId);
        }
        if (!Number.isInteger(nextAgentAllocateHourlyLimit) || nextAgentAllocateHourlyLimit < 0) {
          return jsonResponse(400, { error: "bad_request", message: "agent_allocate_hourly_limit must be an integer >= 0" }, requestId);
        }

        runtimeSettings.overageChargeUsdc = Number(nextOverage.toFixed(6));
        runtimeSettings.agentAllocateHourlyLimit = nextAgentAllocateHourlyLimit;
        if (typeof store.updateRuntimeSettings === "function") {
          await store.updateRuntimeSettings({
            overage_charge_usdc: runtimeSettings.overageChargeUsdc,
            agent_allocate_hourly_limit: runtimeSettings.agentAllocateHourlyLimit,
          });
        }

        return jsonResponse(
          200,
          {
            status: "updated",
            overage_charge_usdc: getOverageChargeUsdc(),
            agent_allocate_hourly_limit: getAgentAllocateHourlyLimit(),
          },
          requestId,
        );
      }

      if (method === "POST" && path === "/v1/payments/proof") {
        const auth = await requireAuth(request, requestId);
        if (!auth.ok) return auth.response;

        const body = await readJsonBody(request);
        const proofMethod = String(body.method || "").trim().toUpperCase();
        const proofPath = String(body.path || "").trim();
        if (!proofMethod || !proofPath) {
          return jsonResponse(400, { error: "bad_request", message: "method and path are required" }, requestId);
        }

        if (!paidBypassTargets.has(`${proofMethod} ${proofPath}`)) {
          return jsonResponse(400, { error: "bad_request", message: "unsupported payment proof target" }, requestId);
        }

        const nowSec = Math.floor(Date.now() / 1000);
        const proof =
          runtimeConfig.paymentMode === "hmac"
            ? buildHmacPaymentProof({
                secret: runtimeConfig.paymentHmacSecret,
                method: proofMethod,
                path: proofPath,
                timestampSec: nowSec,
              })
            : "mock-proof";

        return jsonResponse(
          200,
          {
            x_payment_proof: proof,
            method: proofMethod,
            path: proofPath,
            amount_usdc: getOverageChargeUsdc(),
            expires_at: new Date((nowSec + runtimeConfig.paymentHmacSkewSec) * 1000).toISOString(),
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

      if (method === "POST" && path === "/v1/auth/siwe/challenge") {
        const body = await readJsonBody(request);
        const walletAddress = String(body.wallet_address || "").trim();
        if (!walletAddress) {
          return jsonResponse(400, { error: "bad_request", message: "wallet_address is required" }, requestId);
        }

        const nonce = createNonce();
        let message;
        try {
          message = await siweService.createChallengeMessage(walletAddress, nonce);
        } catch (err) {
          if (err.code === "INVALID_SIWE_MESSAGE") {
            return jsonResponse(400, { error: "bad_request", message: err.message }, requestId);
          }
          throw err;
        }
        await store.saveChallenge(walletAddress, nonce, message);

        return jsonResponse(200, { nonce, message }, requestId);
      }

      if (method === "POST" && path === "/v1/auth/siwe/verify") {
        const body = await readJsonBody(request);
        const message = String(body.message || "");
        const signature = String(body.signature || "");
        if (!message || !signature) {
          return jsonResponse(400, { error: "bad_request", message: "message and signature are required" }, requestId);
        }

        let parsed;
        try {
          parsed = await siweService.parseMessage(message);
        } catch (err) {
          if (err.code === "INVALID_SIWE_MESSAGE") {
            return jsonResponse(400, { error: "bad_request", message: err.message }, requestId);
          }
          throw err;
        }

        const walletAddress = parsed.address;
        const nonce = parsed.nonce;
        const challenge = await store.getChallenge(walletAddress);

        if (!challenge || challenge.nonce !== nonce || challenge.message !== message) {
          return jsonResponse(401, { error: "unauthorized", message: "challenge mismatch or expired" }, requestId);
        }

        const verified = await siweService.verifySignature({
          message,
          signature,
          expectedAddress: walletAddress,
          expectedNonce: nonce,
        });

        if (!verified.ok) {
          return jsonResponse(401, { error: "unauthorized", message: verified.message || "invalid signature" }, requestId);
        }

        await store.consumeChallenge(walletAddress);
        const identity = await store.getOrCreateIdentity(walletAddress);

        const token = createJwt(
          {
            tenant_id: identity.tenantId,
            agent_id: identity.agentId,
            did: identity.did,
            scopes: ["mail:allocate", "mail:read", "mail:send", "webhook:write", "billing:read"],
          },
          runtimeConfig.jwtSecret,
          3600,
        );

        return jsonResponse(
          200,
          {
            access_token: token,
            token_type: "Bearer",
            expires_in: 3600,
            did: identity.did,
            tenant_id: identity.tenantId,
            agent_id: identity.agentId,
          },
          requestId,
        );
      }

      const v2Response = await handleV2Route({ method, path, request, requestId, requestUrl });
      if (v2Response) return v2Response;

      const internalResponse = await handleInternalRoute({ method, path, request, requestId, requestUrl });
      if (internalResponse) return internalResponse;

      const v1Response = await handleV1Route({ method, path, request, requestId, requestUrl });
      if (v1Response) return v1Response;

      if (path.startsWith("/v1/admin/")) {
        const auth = await requireAdminAuth(request, requestId);
        if (!auth.ok) return auth.response;
        const paging = parsePaging(requestUrl);
        const actorDid = auth.actorDid;

        if (method === "GET" && path === "/v1/admin/overview/metrics") {
          const metrics = await store.adminOverviewMetrics();
          return jsonResponse(200, metrics, requestId);
        }

        if (method === "GET" && path === "/v1/admin/overview/timeseries") {
          const bucket = requestUrl.searchParams.get("bucket") || "hour";
          if (!["minute", "hour", "day"].includes(bucket)) {
            return jsonResponse(400, { error: "bad_request", message: "bucket must be minute, hour or day" }, requestId);
          }
          const points = await store.adminOverviewTimeseries({
            from: requestUrl.searchParams.get("from"),
            to: requestUrl.searchParams.get("to"),
            bucket,
          });
          return jsonResponse(200, points, requestId);
        }

        if (method === "GET" && path === "/v1/admin/tenants") {
          if (!paging.ok) return jsonResponse(400, { error: "bad_request", message: paging.message }, requestId);
          const status = requestUrl.searchParams.get("status");
          const result = await store.adminListTenants({ page: paging.page, pageSize: paging.pageSize, status });
          return jsonResponse(200, result, requestId);
        }

        if (path.startsWith("/v1/admin/tenants/")) {
          const tenantId = path.replace("/v1/admin/tenants/", "").trim();
          if (!tenantId) {
            return jsonResponse(400, { error: "bad_request", message: "tenant_id is required" }, requestId);
          }

          if (method === "GET") {
            const tenant = await store.adminGetTenant(tenantId);
            if (!tenant) {
              return jsonResponse(404, { error: "not_found", message: "Tenant not found" }, requestId);
            }
            return jsonResponse(200, tenant, requestId);
          }

          if (method === "PATCH") {
            const body = await readJsonBody(request);
            const tenant = await store.adminPatchTenant(tenantId, body, { actorDid, requestId });
            if (!tenant) {
              return jsonResponse(404, { error: "not_found", message: "Tenant not found" }, requestId);
            }
            return jsonResponse(200, tenant, requestId);
          }
        }

        if (method === "GET" && path === "/v1/admin/mailboxes") {
          if (!paging.ok) return jsonResponse(400, { error: "bad_request", message: paging.message }, requestId);
          const result = await store.adminListMailboxes({
            page: paging.page,
            pageSize: paging.pageSize,
            status: requestUrl.searchParams.get("status"),
            tenantId: requestUrl.searchParams.get("tenant_id"),
          });
          return jsonResponse(200, result, requestId);
        }

        if (path.startsWith("/v1/admin/mailboxes/") && path.endsWith("/freeze") && method === "POST") {
          const mailboxId = path.slice("/v1/admin/mailboxes/".length, -"/freeze".length);
          const body = await readJsonBody(request);
          if (!String(body.reason || "").trim()) {
            return jsonResponse(400, { error: "bad_request", message: "reason is required" }, requestId);
          }
          const result = await store.adminFreezeMailbox(mailboxId, {
            reason: String(body.reason).trim(),
            actorDid,
            requestId,
          });
          if (!result) {
            return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
          }
          return jsonResponse(200, result, requestId);
        }

        if (path.startsWith("/v1/admin/mailboxes/") && path.endsWith("/release") && method === "POST") {
          const mailboxId = path.slice("/v1/admin/mailboxes/".length, -"/release".length);
          const result = await store.adminReleaseMailbox(mailboxId, { actorDid, requestId });
          if (!result) {
            return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
          }
          return jsonResponse(200, result, requestId);
        }

        if (method === "GET" && path === "/v1/admin/messages") {
          if (!paging.ok) return jsonResponse(400, { error: "bad_request", message: paging.message }, requestId);
          const result = await store.adminListMessages({
            page: paging.page,
            pageSize: paging.pageSize,
            mailboxId: requestUrl.searchParams.get("mailbox_id"),
            parsedStatus: requestUrl.searchParams.get("parsed_status"),
          });
          return jsonResponse(200, result, requestId);
        }

        if (path.startsWith("/v1/admin/messages/") && path.endsWith("/reparse") && method === "POST") {
          const messageId = path.slice("/v1/admin/messages/".length, -"/reparse".length);
          const result = await store.adminReparseMessage(messageId, { actorDid, requestId });
          if (!result) {
            return jsonResponse(404, { error: "not_found", message: "Message not found" }, requestId);
          }
          return jsonResponse(202, result, requestId);
        }

        if (path.startsWith("/v1/admin/messages/") && path.endsWith("/replay-webhook") && method === "POST") {
          const messageId = path.slice("/v1/admin/messages/".length, -"/replay-webhook".length);
          const result = await store.adminReplayMessageWebhook(messageId, { actorDid, requestId });
          if (!result) {
            return jsonResponse(404, { error: "not_found", message: "Message not found" }, requestId);
          }
          return jsonResponse(202, result, requestId);
        }

        if (method === "GET" && path === "/v1/admin/webhooks") {
          if (!paging.ok) return jsonResponse(400, { error: "bad_request", message: paging.message }, requestId);
          const result = await store.adminListWebhooks({ page: paging.page, pageSize: paging.pageSize });
          return jsonResponse(200, result, requestId);
        }

        if (path.startsWith("/v1/admin/webhooks/") && path.endsWith("/replay") && method === "POST") {
          const webhookId = path.slice("/v1/admin/webhooks/".length, -"/replay".length);
          const body = await readJsonBody(request);
          const result = await store.adminReplayWebhook(webhookId, {
            from: body.from,
            to: body.to,
            actorDid,
            requestId,
          });
          if (!result) {
            return jsonResponse(404, { error: "not_found", message: "Webhook not found" }, requestId);
          }
          return jsonResponse(202, result, requestId);
        }

        if (path.startsWith("/v1/admin/webhooks/") && path.endsWith("/rotate-secret") && method === "POST") {
          const webhookId = path.slice("/v1/admin/webhooks/".length, -"/rotate-secret".length);
          const result = await store.adminRotateWebhookSecret(webhookId, { actorDid, requestId });
          if (!result) {
            return jsonResponse(404, { error: "not_found", message: "Webhook not found" }, requestId);
          }
          return jsonResponse(200, result, requestId);
        }

        if (method === "GET" && path === "/v1/admin/invoices") {
          if (!paging.ok) return jsonResponse(400, { error: "bad_request", message: paging.message }, requestId);
          const result = await store.adminListInvoices({
            page: paging.page,
            pageSize: paging.pageSize,
            period: requestUrl.searchParams.get("period"),
          });
          return jsonResponse(200, result, requestId);
        }

        if (path.startsWith("/v1/admin/invoices/") && path.endsWith("/issue") && method === "POST") {
          const invoiceId = path.slice("/v1/admin/invoices/".length, -"/issue".length);
          const result = await store.adminIssueInvoice(invoiceId, { actorDid, requestId });
          if (!result) {
            return jsonResponse(404, { error: "not_found", message: "Invoice not found" }, requestId);
          }
          return jsonResponse(200, result, requestId);
        }

        if (method === "GET" && path === "/v1/admin/risk/events") {
          if (!paging.ok) return jsonResponse(400, { error: "bad_request", message: paging.message }, requestId);
          const result = await store.adminListRiskEvents({ page: paging.page, pageSize: paging.pageSize });
          return jsonResponse(200, result, requestId);
        }

        if (method === "POST" && path === "/v1/admin/risk/policies") {
          const body = await readJsonBody(request);
          const policyType = String(body.policy_type || "");
          const value = String(body.value || "");
          const action = String(body.action || "");
          if (!policyType || !value || !action) {
            return jsonResponse(400, { error: "bad_request", message: "policy_type, value and action are required" }, requestId);
          }
          const result = await store.adminUpsertRiskPolicy({
            policyType,
            value,
            action,
            actorDid,
            requestId,
          });
          return jsonResponse(200, result, requestId);
        }

        if (method === "GET" && path === "/v1/admin/audit/logs") {
          if (!paging.ok) return jsonResponse(400, { error: "bad_request", message: paging.message }, requestId);
          const result = await store.adminListAuditLogs({
            page: paging.page,
            pageSize: paging.pageSize,
            requestId: requestUrl.searchParams.get("request_id"),
            tenantId: requestUrl.searchParams.get("tenant_id"),
            actorDid: requestUrl.searchParams.get("actor_did"),
          });
          return jsonResponse(200, result, requestId);
        }
      }

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
