import { createInternalService } from "../services/internal-service.js";
import { createInternalResponses } from "./responses.js";
import { parseInboundEventBody, parseInternalPathParam, parseMailboxCallbackBody } from "./validation.js";

export function createInternalRouteHandler({
  store,
  queue,
  requireInternalAuth,
  jsonResponse,
  readJsonBody,
}) {
  const internalService = createInternalService({ store, queue });
  const responses = createInternalResponses({ jsonResponse });

  return async function handleInternalRoute({ method, path, request, requestId }) {
    if (!path.startsWith("/internal/")) return null;

    if (method === "POST" && path === "/internal/inbound/events") {
      const auth = requireInternalAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const body = await readJsonBody(request);
      const parsed = parseInboundEventBody(body);
      if (!parsed.ok) {
        return responses.badRequest(requestId, parsed.message);
      }

      const result = await internalService.ingestInboundEvent({
        mailboxAddress: parsed.mailboxAddress,
        sender: parsed.sender,
        senderDomain: parsed.senderDomain,
        subject: parsed.subject,
        providerMessageId: parsed.providerMessageId,
        rawRef: parsed.rawRef,
        receivedAt: parsed.receivedAt,
        textExcerpt: parsed.textExcerpt,
        htmlExcerpt: parsed.htmlExcerpt,
        htmlBody: parsed.htmlBody,
        headers: parsed.headers,
        requestId,
      });
      if (!result) {
        return responses.notFound(requestId, "Mailbox not found");
      }

      return responses.accepted(requestId, result);
    }

    if (method === "POST" && path === "/internal/mailboxes/provision") {
      const auth = requireInternalAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const body = await readJsonBody(request);
      const parsed = parseMailboxCallbackBody(body);
      if (!parsed.ok) {
        return responses.badRequest(requestId, parsed.message);
      }

      const result = await internalService.recordMailboxProvision({
        mailboxAddress: parsed.mailboxAddress,
        providerRef: parsed.providerRef,
        requestId,
      });
      if (!result) {
        return responses.notFound(requestId, "Mailbox not found");
      }
      return responses.accepted(requestId, result);
    }

    if (method === "POST" && path === "/internal/mailboxes/release") {
      const auth = requireInternalAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const body = await readJsonBody(request);
      const parsed = parseMailboxCallbackBody(body);
      if (!parsed.ok) {
        return responses.badRequest(requestId, parsed.message);
      }

      const result = await internalService.recordMailboxRelease({
        mailboxAddress: parsed.mailboxAddress,
        providerRef: parsed.providerRef,
        requestId,
      });
      if (!result) {
        return responses.notFound(requestId, "Mailbox not found");
      }
      return responses.accepted(requestId, result);
    }

    if (method === "GET" && path.startsWith("/internal/mailboxes/")) {
      const auth = requireInternalAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const mailboxAddressResult = parseInternalPathParam(path, {
        prefix: "/internal/mailboxes/",
        name: "address",
      });
      if (!mailboxAddressResult.ok) {
        return responses.badRequest(requestId, mailboxAddressResult.message);
      }

      const mailbox = await internalService.getMailboxByAddress(mailboxAddressResult.value);
      if (!mailbox) {
        return responses.notFound(requestId, "Mailbox not found");
      }
      return responses.ok(requestId, mailbox);
    }

    if (method === "GET" && path.startsWith("/internal/messages/")) {
      const auth = requireInternalAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const messageIdResult = parseInternalPathParam(path, {
        prefix: "/internal/messages/",
        name: "message_id",
      });
      if (!messageIdResult.ok) {
        return responses.badRequest(requestId, messageIdResult.message);
      }

      const message = await internalService.getMessageById(messageIdResult.value);
      if (!message) {
        return responses.notFound(requestId, "Message not found");
      }
      return responses.ok(requestId, message);
    }

    return null;
  };
}
