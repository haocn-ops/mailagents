import { parseInboundContent } from "../parser.js";
import { createInternalRepository } from "../internal/repository.js";

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

export function createInternalService({ store, webhookDispatcher }) {
  const repository = createInternalRepository({ store });

  return {
    async ingestInboundEvent({
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
    }) {
      const mailbox = await repository.findMailboxByAddress(mailboxAddress);
      if (!mailbox) return null;

      const ingested = await repository.ingestInboundMessage({
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
      await repository.applyMessageParseResult({
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
      const message = await repository.getMessage(ingested.messageId);
      const webhooks = await repository.listActiveWebhooksByEvent(mailbox.tenantId, eventType);
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
        await repository.recordWebhookDelivery(webhook.id, {
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

      return {
        status: "accepted",
        tenant_id: ingested.tenantId,
        mailbox_id: ingested.mailboxId,
        message_id: ingested.messageId,
      };
    },

    async recordMailboxProvision({ mailboxAddress, providerRef, requestId }) {
      const mailbox = await repository.findMailboxByAddress(mailboxAddress);
      if (!mailbox) return null;

      if (providerRef) {
        await repository.saveMailboxProviderRef(mailbox.id, providerRef);
      }
      await repository.recordMailboxBackendEvent({
        tenantId: mailbox.tenantId,
        mailboxId: mailbox.id,
        action: "mailbox.backend_provisioned",
        requestId,
        metadata: { provider_ref: providerRef },
      });

      return {
        status: "accepted",
        tenant_id: mailbox.tenantId,
        mailbox_id: mailbox.id,
        provider_ref: providerRef,
      };
    },

    async recordMailboxRelease({ mailboxAddress, providerRef, requestId }) {
      const mailbox = await repository.findMailboxByAddress(mailboxAddress);
      if (!mailbox) return null;

      if (providerRef) {
        await repository.saveMailboxProviderRef(mailbox.id, providerRef);
      }
      await repository.recordMailboxBackendEvent({
        tenantId: mailbox.tenantId,
        mailboxId: mailbox.id,
        action: "mailbox.backend_released",
        requestId,
        metadata: { provider_ref: providerRef },
      });

      return {
        status: "accepted",
        tenant_id: mailbox.tenantId,
        mailbox_id: mailbox.id,
        provider_ref: providerRef,
      };
    },

    async getMailboxByAddress(mailboxAddress) {
      const mailbox = await repository.findMailboxByAddress(mailboxAddress);
      if (!mailbox) return null;

      const lease = await repository.getActiveLeaseByMailboxId(mailbox.id);
      return toInternalMailbox(mailbox, lease);
    },

    async getMessageById(messageId) {
      const message = await repository.getMessage(messageId);
      if (!message) return null;
      return toInternalMessage(message);
    },
  };
}
