import { createV2MailboxService } from "../services/v2-mailbox-service.js";
import { createV2Authz } from "./authz.js";
import { createV2Metering } from "./metering.js";
import { parseIntegerInRange, parseRequiredPathParam } from "./validation.js";

export function createV2MailboxRouteHandler({
  store,
  mailBackend,
  requireAuth,
  evaluateAccess,
  jsonResponse,
  readJsonBody,
  getOverageChargeUsdc,
}) {
  const mailboxService = createV2MailboxService({ store, mailBackend });
  const authz = createV2Authz({ requireAuth, evaluateAccess });
  const metering = createV2Metering({ store, getOverageChargeUsdc });

  return async function handleV2MailboxRoute({ method, path, request, requestId }) {
    if (!path.startsWith("/v2/mailboxes/")) return null;

    if (method === "GET" && path === "/v2/mailboxes/accounts") {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;
      const items = await mailboxService.listAccounts(auth.payload.tenant_id);
      return jsonResponse(200, { items }, requestId);
    }

    if (method === "GET" && path === "/v2/mailboxes/leases") {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;
      const items = await mailboxService.listLeases(auth.payload.tenant_id);
      return jsonResponse(200, { items }, requestId);
    }

    if (method === "POST" && path === "/v2/mailboxes/leases") {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const body = await readJsonBody(request);
      const purpose = String(body.purpose || "").trim();
      const ttlHoursResult = parseIntegerInRange(body.ttl_hours, { name: "ttl_hours", min: 1, max: 720 });
      const agentId = String(body.agent_id || "");

      if (!agentId || !purpose || body.ttl_hours == null || body.ttl_hours === "") {
        return jsonResponse(400, { error: "bad_request", message: "agent_id, purpose, ttl_hours are required" }, requestId);
      }
      if (!ttlHoursResult.ok) {
        return jsonResponse(400, { error: "bad_request", message: ttlHoursResult.error }, requestId);
      }
      if (auth.payload.agent_id !== agentId) {
        return jsonResponse(403, { error: "forbidden", message: "agent_id does not match token" }, requestId);
      }
      const ttlHours = ttlHoursResult.value;

      const access = await authz.requireTenantAccess({
        request,
        requestId,
        tenantId: auth.payload.tenant_id,
        agentId,
        endpoint: "POST /v2/mailboxes/leases",
        checkAllocateHourly: true,
        allocateHourlyEndpoints: ["POST /v1/mailboxes/allocate", "POST /v2/mailboxes/leases"],
      });
      if (!access.ok) return access.response;

      let result;
      try {
        result = await mailboxService.allocateLease({
          tenantId: auth.payload.tenant_id,
          agentId,
          purpose,
          ttlHours,
        });
      } catch (err) {
        return jsonResponse(502, { error: "mail_backend_error", message: err.message || "Mail backend provisioning failed" }, requestId);
      }
      if (!result) {
        return jsonResponse(409, { error: "no_available_mailbox", message: "No available mailbox for current tenant" }, requestId);
      }

      await metering.recordUsageAndCharge({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v2/mailboxes/leases",
        requestId,
        access,
      });

      return jsonResponse(201, result, requestId);
    }

    if (method === "POST" && path.startsWith("/v2/mailboxes/leases/") && path.endsWith("/release")) {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const leaseIdResult = parseRequiredPathParam(path, {
        prefix: "/v2/mailboxes/leases/",
        suffix: "/release",
        name: "lease_id",
      });
      if (!leaseIdResult.ok) {
        return jsonResponse(400, { error: "bad_request", message: leaseIdResult.error }, requestId);
      }
      const leaseId = leaseIdResult.value;
      let result;
      try {
        result = await mailboxService.releaseLease({ tenantId: auth.payload.tenant_id, leaseId });
      } catch (err) {
        return jsonResponse(502, { error: "mail_backend_error", message: err.message || "Mail backend release failed" }, requestId);
      }
      if (!result) {
        return jsonResponse(404, { error: "not_found", message: "Lease not found" }, requestId);
      }

      await metering.recordUsage({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v2/mailboxes/leases/{lease_id}/release",
        requestId,
      });

      return jsonResponse(202, result, requestId);
    }

    if (method === "POST" && path.startsWith("/v2/mailboxes/accounts/") && path.endsWith("/credentials/reset")) {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const accountIdResult = parseRequiredPathParam(path, {
        prefix: "/v2/mailboxes/accounts/",
        suffix: "/credentials/reset",
        name: "account_id",
      });
      if (!accountIdResult.ok) {
        return jsonResponse(400, { error: "bad_request", message: accountIdResult.error }, requestId);
      }
      const accountId = accountIdResult.value;
      const credentials = await mailboxService.resetCredentials({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        accountId,
      });
      if (!credentials) {
        return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
      }

      await metering.recordUsage({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v2/mailboxes/accounts/{account_id}/credentials/reset",
        requestId,
      });

      return jsonResponse(200, credentials, requestId);
    }

    return null;
  };
}
