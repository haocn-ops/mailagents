import { createMessageService } from "../services/message-service.js";
import { createV2Authz } from "./authz.js";
import { createV2Metering } from "./metering.js";
import { parseIntegerInRange, parseRecipients, parseRequiredPathParam } from "./validation.js";

export function createV2MessageRouteHandler({
  store,
  mailBackend,
  requireAuth,
  evaluateAccess,
  jsonResponse,
  readJsonBody,
  getOverageChargeUsdc,
}) {
  const messageService = createMessageService({ store, mailBackend });
  const authz = createV2Authz({ requireAuth, evaluateAccess });
  const metering = createV2Metering({ store, getOverageChargeUsdc });

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
        endpoint: "GET /v1/messages/latest",
      });
      if (!access.ok) return access.response;

      const mailboxId = requestUrl.searchParams.get("mailbox_id");
      const since = requestUrl.searchParams.get("since");
      const limitResult = parseIntegerInRange(requestUrl.searchParams.get("limit"), {
        name: "limit",
        min: 1,
        max: 100,
        defaultValue: 20,
      });
      if (!mailboxId) {
        return jsonResponse(400, { error: "bad_request", message: "mailbox_id is required" }, requestId);
      }
      if (!limitResult.ok) {
        return jsonResponse(400, { error: "bad_request", message: limitResult.error }, requestId);
      }
      const limit = limitResult.value;

      const messages = await messageService.listMessages({
        tenantId: auth.payload.tenant_id,
        mailboxId,
        since,
        limit,
      });
      if (messages === null) {
        return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
      }

      await metering.recordUsageAndCharge({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "GET /v1/messages/latest",
        requestId,
        access,
      });

      return jsonResponse(200, { items: messages }, requestId);
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
      const mailboxId = String(body.mailbox_id || "").trim();
      const recipients = parseRecipients(body.to);
      const subject = String(body.subject || "").trim();
      const text = String(body.text || "");
      const html = String(body.html || "");
      const mailboxPassword = String(body.mailbox_password || "").trim();

      if (!mailboxId || !recipients.length || !subject || !mailboxPassword || (!text && !html)) {
        return jsonResponse(
          400,
          { error: "bad_request", message: "mailbox_id, to, subject, mailbox_password, and text or html are required" },
          requestId,
        );
      }

      try {
        const result = await messageService.sendMessage({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          mailboxId,
          mailboxPassword,
          recipients,
          subject,
          text,
          html,
          requestId,
        });
        if (!result) {
          return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
        }

        await metering.recordUsageAndCharge({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          endpoint: "POST /v2/messages/send",
          requestId,
          access,
        });

        return jsonResponse(202, result, requestId);
      } catch (err) {
        if (err.sendAttemptId) {
          return jsonResponse(
            502,
            {
              error: "mail_backend_error",
              message: err.message || "Mail backend send failed",
              send_attempt_id: err.sendAttemptId,
            },
            requestId,
          );
        }
        if (err.message === "Mailbox not found") {
          return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
        }
        return jsonResponse(
          502,
          {
            error: "mail_backend_error",
            message: err.message || "Mail backend send failed",
          },
          requestId,
        );
      }
    }

    if (method === "GET" && path === "/v2/send-attempts") {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;
      const items = await messageService.listSendAttempts(auth.payload.tenant_id);
      return jsonResponse(200, { items }, requestId);
    }

    if (method === "GET" && path.startsWith("/v2/send-attempts/")) {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const sendAttemptIdResult = parseRequiredPathParam(path, {
        prefix: "/v2/send-attempts/",
        name: "send_attempt_id",
      });
      if (!sendAttemptIdResult.ok) {
        return jsonResponse(400, { error: "bad_request", message: sendAttemptIdResult.error }, requestId);
      }
      const sendAttemptId = sendAttemptIdResult.value;

      const sendAttempt = await messageService.getSendAttempt(auth.payload.tenant_id, sendAttemptId);
      if (!sendAttempt) {
        return jsonResponse(404, { error: "not_found", message: "Send attempt not found" }, requestId);
      }
      return jsonResponse(200, sendAttempt, requestId);
    }

    if (method === "GET" && path.startsWith("/v2/messages/")) {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const messageIdResult = parseRequiredPathParam(path, {
        prefix: "/v2/messages/",
        name: "message_id",
      });
      if (!messageIdResult.ok) {
        return jsonResponse(400, { error: "bad_request", message: messageIdResult.error }, requestId);
      }
      const messageId = messageIdResult.value;

      const message = await messageService.getMessage(auth.payload.tenant_id, messageId);
      if (!message) {
        return jsonResponse(404, { error: "not_found", message: "Message not found" }, requestId);
      }
      return jsonResponse(200, message, requestId);
    }

    return null;
  };
}
