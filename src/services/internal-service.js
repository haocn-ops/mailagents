import { MESSAGE_PARSE_JOB } from "../jobs/message-parse-job.js";
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

export function createInternalService({ store, queue, repository = createInternalRepository({ store }) }) {

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

      if (ingested?.deduped) {
        return {
          status: "accepted",
          deduped: true,
          tenant_id: ingested.tenantId,
          mailbox_id: ingested.mailboxId,
          message_id: ingested.messageId,
          parse_job: null,
        };
      }

      const job = await queue.enqueue(MESSAGE_PARSE_JOB, {
        tenantId: mailbox.tenantId,
        mailboxId: mailbox.id,
        messageId: ingested.messageId,
        sender,
        senderDomain,
        subject,
        receivedAt,
        textExcerpt,
        htmlExcerpt,
        htmlBody,
        source: "mailu-internal-event",
        requestId,
      });

      return {
        status: "accepted",
        tenant_id: ingested.tenantId,
        mailbox_id: ingested.mailboxId,
        message_id: ingested.messageId,
        parse_job: {
          job_id: job.id,
          status: job.status,
        },
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
