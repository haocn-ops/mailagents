import { parseLatestMessagesQuery, parseMessageId, parseSendMessageBody } from "./validation.js";

export function createV1MessageRouteHandler({
  messageService,
  authz,
  metering,
  responses,
  readJsonBody,
}) {
  return async function handleV1MessageRoute({ method, path, request, requestId, requestUrl }) {
    if (method === "GET" && path === "/v1/messages/latest") {
      const auth = await authz.requireTenant(request, requestId);
      if (!auth.ok) return auth.response;

      const access = await authz.requireAccess({
        request,
        requestId,
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "GET /v1/messages/latest",
      });
      if (!access.ok) return access.response;

      const query = parseLatestMessagesQuery(requestUrl);
      if (!query.ok) {
        return responses.badRequest(requestId, query.message);
      }

      const messages = await messageService.getLatestMessages({
        tenantId: auth.payload.tenant_id,
        mailboxId: query.mailboxId,
        since: query.since,
        limit: query.limit,
      });
      if (messages === null) {
        return responses.notFound(requestId, "Mailbox not found");
      }

      await metering.recordUsage({ auth, endpoint: "GET /v1/messages/latest", requestId, access });
      return responses.okMessages(requestId, messages);
    }

    if (method === "POST" && path === "/v1/messages/send") {
      const auth = await authz.requireTenant(request, requestId);
      if (!auth.ok) return auth.response;

      const access = await authz.requireAccess({
        request,
        requestId,
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v1/messages/send",
      });
      if (!access.ok) return access.response;

      const body = await readJsonBody(request);
      const parsed = parseSendMessageBody(body);
      if (!parsed.ok) {
        return responses.badRequest(requestId, parsed.message);
      }

      let delivery;
      try {
        delivery = await messageService.sendMessage({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          mailboxId: parsed.mailboxId,
          recipients: parsed.recipients,
          subject: parsed.subject,
          text: parsed.text,
          html: parsed.html,
          mailboxPassword: parsed.mailboxPassword,
        });
      } catch (err) {
        return responses.mailBackendError(requestId, err.message || "Mail backend send failed");
      }
      if (!delivery) {
        return responses.notFound(requestId, "Mailbox not found");
      }

      await metering.recordUsage({ auth, endpoint: "POST /v1/messages/send", requestId, access });
      return responses.ok(requestId, delivery);
    }

    if (method === "GET" && path.startsWith("/v1/messages/")) {
      const auth = await authz.requireTenant(request, requestId);
      if (!auth.ok) return auth.response;

      const messageResult = parseMessageId(path);
      if (!messageResult.ok) {
        return responses.badRequest(requestId, messageResult.message);
      }

      const message = await messageService.getMessageDetail(auth.payload.tenant_id, messageResult.messageId);
      if (!message) {
        return responses.notFound(requestId, "Message not found");
      }
      return responses.ok(requestId, message);
    }

    return null;
  };
}
