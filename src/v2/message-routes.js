import { createMessageService } from "../services/message-service.js";

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

  return async function handleV2MessageRoute({ method, path, request, requestId, requestUrl }) {
    if (!path.startsWith("/v2/messages") && !path.startsWith("/v2/send-attempts")) return null;

    if (method === "GET" && path === "/v2/messages") {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;
      const access = await evaluateAccess({
        request,
        requestId,
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "GET /v1/messages/latest",
      });
      if (!access.ok) return access.response;

      const mailboxId = requestUrl.searchParams.get("mailbox_id");
      const since = requestUrl.searchParams.get("since");
      const limitRaw = requestUrl.searchParams.get("limit");
      const limit = limitRaw ? Number(limitRaw) : 20;
      if (!mailboxId) {
        return jsonResponse(400, { error: "bad_request", message: "mailbox_id is required" }, requestId);
      }
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        return jsonResponse(400, { error: "bad_request", message: "limit must be 1..100" }, requestId);
      }

      const messages = await messageService.listMessages({
        tenantId: auth.payload.tenant_id,
        mailboxId,
        since,
        limit,
      });
      if (messages === null) {
        return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
      }

      await store.recordUsage({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "GET /v1/messages/latest",
        quantity: 1,
        requestId,
      });
      if (access.requiresCharge) {
        await store.recordOverageCharge({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          endpoint: "GET /v1/messages/latest",
          reasons: access.reasons,
          amountUsdc: getOverageChargeUsdc(),
          requestId,
        });
      }

      return jsonResponse(200, { items: messages }, requestId);
    }

    if (method === "POST" && path === "/v2/messages/send") {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;
      const access = await evaluateAccess({
        request,
        requestId,
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v2/messages/send",
      });
      if (!access.ok) return access.response;

      const body = await readJsonBody(request);
      const mailboxId = String(body.mailbox_id || "").trim();
      const recipients = Array.isArray(body.to)
        ? body.to.map((item) => String(item || "").trim()).filter(Boolean)
        : String(body.to || "").trim()
          ? [String(body.to || "").trim()]
          : [];
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

        await store.recordUsage({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          endpoint: "POST /v2/messages/send",
          quantity: 1,
          requestId,
        });
        if (access.requiresCharge) {
          await store.recordOverageCharge({
            tenantId: auth.payload.tenant_id,
            agentId: auth.payload.agent_id,
            endpoint: "POST /v2/messages/send",
            reasons: access.reasons,
            amountUsdc: getOverageChargeUsdc(),
            requestId,
          });
        }

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
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;
      const items = await messageService.listSendAttempts(auth.payload.tenant_id);
      return jsonResponse(200, { items }, requestId);
    }

    if (method === "GET" && path.startsWith("/v2/send-attempts/")) {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const sendAttemptId = path.replace("/v2/send-attempts/", "").trim();
      if (!sendAttemptId) {
        return jsonResponse(400, { error: "bad_request", message: "send_attempt_id is required" }, requestId);
      }

      const sendAttempt = await messageService.getSendAttempt(auth.payload.tenant_id, sendAttemptId);
      if (!sendAttempt) {
        return jsonResponse(404, { error: "not_found", message: "Send attempt not found" }, requestId);
      }
      return jsonResponse(200, sendAttempt, requestId);
    }

    if (method === "GET" && path.startsWith("/v2/messages/")) {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const messageId = path.replace("/v2/messages/", "").trim();
      if (!messageId) {
        return jsonResponse(400, { error: "bad_request", message: "message_id is required" }, requestId);
      }

      const message = await messageService.getMessage(auth.payload.tenant_id, messageId);
      if (!message) {
        return jsonResponse(404, { error: "not_found", message: "Message not found" }, requestId);
      }
      return jsonResponse(200, message, requestId);
    }

    return null;
  };
}
