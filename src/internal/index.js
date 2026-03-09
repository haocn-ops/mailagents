import { parseInboundContent } from "../parser.js";

function toInternalMailbox(mailbox, lease) {
  return {
    mailbox_id: mailbox.id,
    tenant_id: mailbox.tenantId,
    address: mailbox.address,
    status: mailbox.status,
    provider_ref: mailbox.providerRef || null,
    active_lease: lease
      ? {
          lease_id: lease.id,
          agent_id: lease.agentId,
          purpose: lease.purpose,
          status: lease.status,
          started_at: lease.startedAt,
          expires_at: lease.expiresAt,
        }
      : null,
  };
}

function toInternalMessage(message) {
  return {
    message_id: message.messageId,
    tenant_id: message.tenantId,
    mailbox_id: message.mailboxId,
    provider_message_id: message.providerMessageId || null,
    sender: message.sender,
    sender_domain: message.senderDomain,
    subject: message.subject,
    raw_ref: message.rawRef || null,
    received_at: message.receivedAt,
  };
}

export function createInternalRouteHandler({
  store,
  requireInternalAuth,
  jsonResponse,
  readJsonBody,
  webhookDispatcher,
}) {
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

      const mailbox = await store.findMailboxByAddress(mailboxAddress);
      if (!mailbox) {
        return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
      }

      const ingested = await store.ingestInboundMessage({
        tenantId: mailbox.tenantId,
        mailboxId: mailbox.id,
        providerMessageId,
        sender,
        senderDomain,
        subject,
        rawRef,
        receivedAt,
        payload: {
          headers,
          text_excerpt: textExcerpt,
          html_excerpt: htmlExcerpt,
          html_body: htmlBody,
        },
        requestId,
      });

      const parsed = parseInboundContent({
        subject,
        textExcerpt,
        htmlExcerpt,
        htmlBody,
      });
      await store.applyMessageParseResult({
        messageId: ingested.messageId,
        otpCode: parsed.otpCode,
        verificationLink: parsed.verificationLink,
        payload: {
          parser: "builtin",
          source: "mailu-internal-event",
          parser_status: parsed.parserStatus,
        },
        requestId,
      });

      const eventType = parsed.parsed ? "otp.extracted" : "mail.received";
      const message = await store.getMessage(ingested.messageId);
      const webhooks = await store.listActiveWebhooksByEvent(mailbox.tenantId, eventType);
      for (const webhook of webhooks) {
        const delivery = await webhookDispatcher.dispatch({
          webhook,
          payload: {
            event_type: eventType,
            tenant_id: mailbox.tenantId,
            mailbox_id: mailbox.id,
            message_id: ingested.messageId,
            sender,
            sender_domain: senderDomain,
            subject,
            received_at: receivedAt,
            otp_code: parsed.otpCode,
            verification_link: parsed.verificationLink,
            message,
          },
        });
        await store.recordWebhookDelivery(webhook.id, {
          statusCode: delivery.statusCode,
          requestId,
          metadata: {
            event_type: eventType,
            delivery_id: delivery.deliveryId,
            attempts: delivery.attempts,
            ok: delivery.ok,
          },
        });
      }

      return jsonResponse(
        202,
        {
          status: "accepted",
          tenant_id: ingested.tenantId,
          mailbox_id: ingested.mailboxId,
          message_id: ingested.messageId,
        },
        requestId,
      );
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

      const mailbox = await store.findMailboxByAddress(mailboxAddress);
      if (!mailbox) {
        return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
      }

      if (providerRef) {
        await store.saveMailboxProviderRef(mailbox.id, providerRef);
      }
      await store.recordMailboxBackendEvent({
        tenantId: mailbox.tenantId,
        mailboxId: mailbox.id,
        action: "mailbox.backend_provisioned",
        requestId,
        metadata: { provider_ref: providerRef },
      });

      return jsonResponse(
        202,
        {
          status: "accepted",
          tenant_id: mailbox.tenantId,
          mailbox_id: mailbox.id,
          provider_ref: providerRef,
        },
        requestId,
      );
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

      const mailbox = await store.findMailboxByAddress(mailboxAddress);
      if (!mailbox) {
        return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
      }

      if (providerRef) {
        await store.saveMailboxProviderRef(mailbox.id, providerRef);
      }
      await store.recordMailboxBackendEvent({
        tenantId: mailbox.tenantId,
        mailboxId: mailbox.id,
        action: "mailbox.backend_released",
        requestId,
        metadata: { provider_ref: providerRef },
      });

      return jsonResponse(
        202,
        {
          status: "accepted",
          tenant_id: mailbox.tenantId,
          mailbox_id: mailbox.id,
          provider_ref: providerRef,
        },
        requestId,
      );
    }

    if (method === "GET" && path.startsWith("/internal/mailboxes/")) {
      const auth = requireInternalAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const mailboxAddress = decodeURIComponent(path.replace("/internal/mailboxes/", "")).trim().toLowerCase();
      if (!mailboxAddress) {
        return jsonResponse(400, { error: "bad_request", message: "address is required" }, requestId);
      }

      const mailbox = await store.findMailboxByAddress(mailboxAddress);
      if (!mailbox) {
        return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
      }

      const lease = await store.getActiveLeaseByMailboxId(mailbox.id);
      return jsonResponse(200, toInternalMailbox(mailbox, lease), requestId);
    }

    if (method === "GET" && path.startsWith("/internal/messages/")) {
      const auth = requireInternalAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const messageId = decodeURIComponent(path.replace("/internal/messages/", "")).trim();
      if (!messageId) {
        return jsonResponse(400, { error: "bad_request", message: "message_id is required" }, requestId);
      }

      const message = await store.getMessage(messageId);
      if (!message) {
        return jsonResponse(404, { error: "not_found", message: "Message not found" }, requestId);
      }

      return jsonResponse(200, toInternalMessage(message), requestId);
    }

    return null;
  };
}
