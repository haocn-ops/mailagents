import { createV2MailboxService } from "../services/v2-mailbox-service.js";
import { createV2Authz } from "./authz.js";
import { createV2Metering } from "./metering.js";
import { createV2Responses } from "./responses.js";
import { parseLeaseCreateBody, parseRequiredPathParam } from "./validation.js";

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
  const responses = createV2Responses({ jsonResponse });

  return async function handleV2MailboxRoute({ method, path, request, requestId }) {
    if (!path.startsWith("/v2/mailboxes/")) return null;

    if (method === "GET" && path === "/v2/mailboxes/accounts") {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;
      const items = await mailboxService.listAccounts(auth.payload.tenant_id);
      return responses.okItems(requestId, items);
    }

    if (method === "GET" && path === "/v2/mailboxes/leases") {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;
      const items = await mailboxService.listLeases(auth.payload.tenant_id);
      return responses.okItems(requestId, items);
    }

    if (method === "POST" && path === "/v2/mailboxes/leases") {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const body = await readJsonBody(request);
      const parsed = parseLeaseCreateBody(body, auth.payload.agent_id);
      if (!parsed.ok) {
        return parsed.status === 403
          ? responses.forbidden(requestId, parsed.message)
          : responses.badRequest(requestId, parsed.message);
      }

      const access = await authz.requireTenantAccess({
        request,
        requestId,
        tenantId: auth.payload.tenant_id,
        agentId: parsed.agentId,
        endpoint: "POST /v2/mailboxes/leases",
        checkAllocateHourly: true,
        allocateHourlyEndpoints: ["POST /v1/mailboxes/allocate", "POST /v2/mailboxes/leases"],
      });
      if (!access.ok) return access.response;

      let result;
      try {
        result = await mailboxService.allocateLease({
          tenantId: auth.payload.tenant_id,
          agentId: parsed.agentId,
          purpose: parsed.purpose,
          ttlHours: parsed.ttlHours,
        });
      } catch (err) {
        return responses.mailBackendError(requestId, err.message || "Mail backend provisioning failed");
      }
      if (!result) {
        return responses.conflict(requestId, "no_available_mailbox", "No available mailbox for current tenant");
      }

      await metering.recordUsageAndCharge({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v2/mailboxes/leases",
        requestId,
        access,
      });

      return responses.created(requestId, result);
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
        return responses.badRequest(requestId, leaseIdResult.error);
      }
      const leaseId = leaseIdResult.value;
      let result;
      try {
        result = await mailboxService.releaseLease({ tenantId: auth.payload.tenant_id, leaseId });
      } catch (err) {
        return responses.mailBackendError(requestId, err.message || "Mail backend release failed");
      }
      if (!result) {
        return responses.notFound(requestId, "Lease not found");
      }

      await metering.recordUsage({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v2/mailboxes/leases/{lease_id}/release",
        requestId,
      });

      return responses.accepted(requestId, result);
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
        return responses.badRequest(requestId, accountIdResult.error);
      }
      const accountId = accountIdResult.value;
      const credentials = await mailboxService.resetCredentials({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        accountId,
      });
      if (!credentials) {
        return responses.notFound(requestId, "Mailbox not found");
      }

      await metering.recordUsage({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v2/mailboxes/accounts/{account_id}/credentials/reset",
        requestId,
      });

      return responses.ok(requestId, credentials);
    }

    return null;
  };
}
