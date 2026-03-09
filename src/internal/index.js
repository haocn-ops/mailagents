import { createInternalService } from "../services/internal-service.js";

export function createInternalRouteHandler({
  store,
  requireInternalAuth,
  jsonResponse,
  readJsonBody,
  webhookDispatcher,
}) {
  const internalService = createInternalService({ store, webhookDispatcher });

  return async function handleInternalRoute({ method, path, request, requestId }) {
    if (!path.startsWith("/internal/")) return null;

    if (method === "POST" && path === "/internal/inbound/events") {
      const auth = requireInternalAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const body = await readJsonBody(request);
      const mailboxAddress = String(body.address || "").trim().toLowerCase();
      const sender = String(body.sender || "").trim().toLowerCase();
      const senderDomain = String(body.sender_domain || "").trim().toLowerCase();
      const subject = String(body.subject || "").trim();
      const providerMessageId = String(body.provider_message_id || "").trim() || null;
      const rawRef = String(body.raw_ref || "").trim() || null;
      const receivedAt = String(body.received_at || "").trim() || new Date().toISOString();
      const textExcerpt = String(body.text_excerpt || "").trim() || null;
      const htmlExcerpt = String(body.html_excerpt || "").trim() || null;
      const htmlBody = String(body.html_body || "").trim() || null;
      const headers = body.headers && typeof body.headers === "object" ? body.headers : {};

      if (!mailboxAddress || !senderDomain) {
        return jsonResponse(
          400,
          { error: "bad_request", message: "address and sender_domain are required" },
          requestId,
        );
      }

      const result = await internalService.ingestInboundEvent({
        mailboxAddress,
        sender,
        senderDomain,
        subject,
        providerMessageId,
        rawRef,
        receivedAt,
        textExcerpt,
        htmlExcerpt,
        htmlBody,
        headers,
        requestId,
      });
      if (!result) {
        return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
      }

      return jsonResponse(202, result, requestId);
    }

    if (method === "POST" && path === "/internal/mailboxes/provision") {
      const auth = requireInternalAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const body = await readJsonBody(request);
      const mailboxAddress = String(body.address || "").trim().toLowerCase();
      const providerRef = String(body.provider_ref || "").trim() || null;
      if (!mailboxAddress) {
        return jsonResponse(400, { error: "bad_request", message: "address is required" }, requestId);
      }

      const result = await internalService.recordMailboxProvision({
        mailboxAddress,
        providerRef,
        requestId,
      });
      if (!result) {
        return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
      }
      return jsonResponse(202, result, requestId);
    }

    if (method === "POST" && path === "/internal/mailboxes/release") {
      const auth = requireInternalAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const body = await readJsonBody(request);
      const mailboxAddress = String(body.address || "").trim().toLowerCase();
      const providerRef = String(body.provider_ref || "").trim() || null;
      if (!mailboxAddress) {
        return jsonResponse(400, { error: "bad_request", message: "address is required" }, requestId);
      }

      const result = await internalService.recordMailboxRelease({
        mailboxAddress,
        providerRef,
        requestId,
      });
      if (!result) {
        return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
      }
      return jsonResponse(202, result, requestId);
    }

    if (method === "GET" && path.startsWith("/internal/mailboxes/")) {
      const auth = requireInternalAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const mailboxAddress = decodeURIComponent(path.replace("/internal/mailboxes/", "")).trim().toLowerCase();
      if (!mailboxAddress) {
        return jsonResponse(400, { error: "bad_request", message: "address is required" }, requestId);
      }

      const mailbox = await internalService.getMailboxByAddress(mailboxAddress);
      if (!mailbox) {
        return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
      }
      return jsonResponse(200, mailbox, requestId);
    }

    if (method === "GET" && path.startsWith("/internal/messages/")) {
      const auth = requireInternalAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const messageId = decodeURIComponent(path.replace("/internal/messages/", "")).trim();
      if (!messageId) {
        return jsonResponse(400, { error: "bad_request", message: "message_id is required" }, requestId);
      }

      const message = await internalService.getMessageById(messageId);
      if (!message) {
        return jsonResponse(404, { error: "not_found", message: "Message not found" }, requestId);
      }
      return jsonResponse(200, message, requestId);
    }

    return null;
  };
}
