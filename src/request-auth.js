import { verifyJwt } from "./auth.js";
import { parseBearerToken } from "./utils.js";

export function createRequestAuth({
  store,
  runtimeConfig,
  paymentVerifier,
  jsonResponse,
  chargeRequiredResponse,
  paidBypassTargets,
  getOverageChargeUsdc,
  getAgentAllocateHourlyLimit,
}) {
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

  async function evaluateAccess({
    request,
    requestId,
    tenantId,
    agentId,
    endpoint,
    checkAllocateHourly = false,
    allocateHourlyEndpoints = ["POST /v2/mailboxes/leases"],
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
        response: jsonResponse(
          403,
          { error: "tenant_inactive", message: `Tenant is ${tenantPolicy.status}` },
          requestId,
        ),
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

  return {
    requireAuth,
    requireInternalAuth,
    requireAdminAuth,
    evaluateAccess,
  };
}
