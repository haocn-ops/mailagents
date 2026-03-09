import { createMailboxService } from "../services/mailbox-service.js";
import { createV2Authz } from "./authz.js";
import { createV2Metering } from "./metering.js";

export function createV2MailboxRouteHandler({
  store,
  mailBackend,
  requireAuth,
  evaluateAccess,
  jsonResponse,
  readJsonBody,
  getOverageChargeUsdc,
}) {
  const mailboxService = createMailboxService({ store, mailBackend });
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
      const ttlHours = Number(body.ttl_hours);
      const agentId = String(body.agent_id || "");

      if (!agentId || !purpose || !Number.isFinite(ttlHours)) {
        return jsonResponse(400, { error: "bad_request", message: "agent_id, purpose, ttl_hours are required" }, requestId);
      }
      if (auth.payload.agent_id !== agentId) {
        return jsonResponse(403, { error: "forbidden", message: "agent_id does not match token" }, requestId);
      }
      if (ttlHours < 1 || ttlHours > 720) {
        return jsonResponse(400, { error: "bad_request", message: "ttl_hours must be 1..720" }, requestId);
      }

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

      const leaseId = path.slice("/v2/mailboxes/leases/".length, -"/release".length);
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

      const accountId = path.slice("/v2/mailboxes/accounts/".length, -"/credentials/reset".length);
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
