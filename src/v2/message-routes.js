import { createV2MessageService } from "../services/v2-message-service.js";
import { createV2Authz } from "./authz.js";
import { createV2Metering } from "./metering.js";
import { createV2Responses } from "./responses.js";
import { parseMessageListQuery, parseRequiredPathParam, parseSendMessageBody } from "./validation.js";

export function createV2MessageRouteHandler({
  store,
  mailBackend,
  requireAuth,
  evaluateAccess,
  jsonResponse,
  readJsonBody,
  getOverageChargeUsdc,
}) {
  const messageService = createV2MessageService({ store, mailBackend });
  const authz = createV2Authz({ requireAuth, evaluateAccess });
  const metering = createV2Metering({ store, getOverageChargeUsdc });
  const responses = createV2Responses({ jsonResponse });

  return async function handleV2MessageRoute({ method, path, request, requestId, requestUrl }) {
    if (!path.startsWith("/v2/messages") && !path.startsWith("/v2/send-attempts")) return null;

    if (method === "GET" && path === "/v2/messages") {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;
      const access = await authz.requireTenantAccess({
        request,
        requestId,
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "GET /v2/messages",
      });
      if (!access.ok) return access.response;

      const parsed = parseMessageListQuery(requestUrl);
      if (!parsed.ok) {
        return responses.badRequest(requestId, parsed.message);
      }

      const messages = await messageService.listMessages({
        tenantId: auth.payload.tenant_id,
        mailboxId: parsed.mailboxId,
        since: parsed.since,
        limit: parsed.limit,
      });
      if (messages === null) {
        return responses.notFound(requestId, "Mailbox not found");
      }

      await metering.recordUsageAndCharge({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "GET /v2/messages",
        requestId,
        access,
      });

      return responses.okItems(requestId, messages);
    }

    if (method === "POST" && path === "/v2/messages/send") {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;
      const access = await authz.requireTenantAccess({
        request,
        requestId,
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v2/messages/send",
      });
      if (!access.ok) return access.response;

      const body = await readJsonBody(request);
      const parsed = parseSendMessageBody(body);
      if (!parsed.ok) {
        return responses.badRequest(requestId, parsed.message);
      }

      try {
        const result = await messageService.sendMessage({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          mailboxId: parsed.mailboxId,
          mailboxPassword: parsed.mailboxPassword,
          recipients: parsed.recipients,
          subject: parsed.subject,
          text: parsed.text,
          html: parsed.html,
          requestId,
        });
        if (!result) {
          return responses.notFound(requestId, "Mailbox not found");
        }

        await metering.recordUsageAndCharge({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          endpoint: "POST /v2/messages/send",
          requestId,
          access,
        });

        return responses.accepted(requestId, result);
      } catch (err) {
        if (err.sendAttemptId) {
          return responses.mailBackendError(requestId, err.message || "Mail backend send failed", {
            send_attempt_id: err.sendAttemptId,
          });
        }
        if (err.message === "Mailbox not found") {
          return responses.notFound(requestId, "Mailbox not found");
        }
        return responses.mailBackendError(requestId, err.message || "Mail backend send failed");
      }
    }

    if (method === "GET" && path === "/v2/send-attempts") {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;
      const items = await messageService.listSendAttempts(auth.payload.tenant_id);
      return responses.okItems(requestId, items);
    }

    if (method === "GET" && path.startsWith("/v2/send-attempts/")) {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const sendAttemptIdResult = parseRequiredPathParam(path, {
        prefix: "/v2/send-attempts/",
        name: "send_attempt_id",
      });
      if (!sendAttemptIdResult.ok) {
        return responses.badRequest(requestId, sendAttemptIdResult.error);
      }
      const sendAttemptId = sendAttemptIdResult.value;

      const sendAttempt = await messageService.getSendAttempt(auth.payload.tenant_id, sendAttemptId);
      if (!sendAttempt) {
        return responses.notFound(requestId, "Send attempt not found");
      }
      return responses.ok(requestId, sendAttempt);
    }

    if (method === "GET" && path.startsWith("/v2/messages/")) {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const messageIdResult = parseRequiredPathParam(path, {
        prefix: "/v2/messages/",
        name: "message_id",
      });
      if (!messageIdResult.ok) {
        return responses.badRequest(requestId, messageIdResult.error);
      }
      const messageId = messageIdResult.value;

      const message = await messageService.getMessage(auth.payload.tenant_id, messageId);
      if (!message) {
        return responses.notFound(requestId, "Message not found");
      }
      return responses.ok(requestId, message);
    }

    return null;
  };
}
