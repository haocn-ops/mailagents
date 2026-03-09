import { parseMailboxActionBody, parseMailboxAllocateBody } from "./validation.js";

export function createV1MailboxRouteHandler({
  mailboxService,
  authz,
  metering,
  responses,
  readJsonBody,
}) {
  return async function handleV1MailboxRoute({ method, path, request, requestId }) {
    if (method === "POST" && path === "/v1/mailboxes/allocate") {
      const auth = await authz.requireTenant(request, requestId);
      if (!auth.ok) return auth.response;

      const body = await readJsonBody(request);
      const allocate = parseMailboxAllocateBody(body, auth.payload.agent_id);
      if (!allocate.ok) {
        return allocate.status === 403
          ? responses.forbidden(requestId, allocate.message)
          : responses.badRequest(requestId, allocate.message);
      }

      const access = await authz.requireAccess({
        request,
        requestId,
        tenantId: auth.payload.tenant_id,
        agentId: allocate.agentId,
        endpoint: "POST /v1/mailboxes/allocate",
        checkAllocateHourly: true,
      });
      if (!access.ok) return access.response;

      let result;
      try {
        result = await mailboxService.allocateMailbox({
          tenantId: auth.payload.tenant_id,
          agentId: allocate.agentId,
          purpose: allocate.purpose,
          ttlHours: allocate.ttlHours,
        });
      } catch (err) {
        return responses.mailBackendError(requestId, err.message || "Mail backend provisioning failed");
      }

      if (!result) {
        return responses.conflict(requestId, "no_available_mailbox", "No available mailbox for current tenant");
      }

      await metering.recordUsage({ auth, endpoint: "POST /v1/mailboxes/allocate", requestId, access });
      return responses.ok(requestId, result);
    }

    if (method === "POST" && path === "/v1/mailboxes/release") {
      const auth = await authz.requireTenant(request, requestId);
      if (!auth.ok) return auth.response;

      const body = await readJsonBody(request);
      const mailboxResult = parseMailboxActionBody(body);
      if (!mailboxResult.ok) {
        return responses.badRequest(requestId, mailboxResult.message);
      }

      let result;
      try {
        result = await mailboxService.releaseMailbox({
          tenantId: auth.payload.tenant_id,
          mailboxId: mailboxResult.mailboxId,
        });
      } catch (err) {
        return responses.mailBackendError(requestId, err.message || "Mail backend release failed");
      }
      if (!result) {
        return responses.notFound(requestId, "Mailbox not found");
      }

      await metering.recordUsage({ auth, endpoint: "POST /v1/mailboxes/release", requestId });
      return responses.ok(requestId, result);
    }

    if (method === "POST" && path === "/v1/mailboxes/credentials/reset") {
      const auth = await authz.requireTenant(request, requestId);
      if (!auth.ok) return auth.response;

      const body = await readJsonBody(request);
      const mailboxResult = parseMailboxActionBody(body);
      if (!mailboxResult.ok) {
        return responses.badRequest(requestId, mailboxResult.message);
      }

      const credentials = await mailboxService.resetMailboxCredentials({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        mailboxId: mailboxResult.mailboxId,
      });
      if (!credentials) {
        return responses.notFound(requestId, "Mailbox not found");
      }

      await metering.recordUsage({ auth, endpoint: "POST /v1/mailboxes/credentials/reset", requestId });
      return responses.ok(requestId, credentials);
    }

    if (method === "GET" && path === "/v1/mailboxes") {
      const auth = await authz.requireTenant(request, requestId);
      if (!auth.ok) return auth.response;

      const items = await mailboxService.listMailboxes(auth.payload.tenant_id);
      return responses.okItems(requestId, items);
    }

    return null;
  };
}
