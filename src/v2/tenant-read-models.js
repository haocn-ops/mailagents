import { createV2MailboxRepository } from "./mailbox-repository.js";
import { createV2MessageRepository } from "./message-repository.js";
import {
  toV2MailboxAccount,
  toV2MailboxLease,
  toV2Message,
  toV2SendAttempt,
} from "./presenters.js";

export function createV2TenantReadModels({ store }) {
  const mailboxRepository = createV2MailboxRepository({ store });
  const messageRepository = createV2MessageRepository({ store });

  return {
    async listMailboxAccounts(tenantId) {
      const mailboxes = await mailboxRepository.listTenantMailboxes(tenantId);
      const items = [];
      for (const mailbox of mailboxes) {
        const lease = await mailboxRepository.getActiveLeaseByMailboxId(mailbox.mailbox_id);
        items.push(toV2MailboxAccount(mailbox, lease));
      }
      return items;
    },

    async listMailboxLeases(tenantId) {
      const mailboxes = await mailboxRepository.listTenantMailboxes(tenantId);
      const items = [];
      for (const mailbox of mailboxes) {
        const lease = await mailboxRepository.getActiveLeaseByMailboxId(mailbox.mailbox_id);
        if (lease) items.push(toV2MailboxLease(mailbox, lease));
      }
      return items;
    },

    async getMailboxLease(tenantId, leaseId) {
      const lease = await mailboxRepository.getTenantLeaseById(tenantId, leaseId);
      if (!lease) return null;
      const mailbox = await mailboxRepository.getTenantMailbox(tenantId, lease.mailboxId);
      if (!mailbox) return null;
      return toV2MailboxLease({
        mailbox_id: mailbox.id,
        address: mailbox.address,
      }, lease);
    },

    async listMessages({ tenantId, mailboxId, since, limit }) {
      const messages = await messageRepository.getLatestMessages({ tenantId, mailboxId, since, limit });
      if (messages === null) return null;
      return messages.map(toV2Message);
    },

    async getMessage(tenantId, messageId) {
      const message = await messageRepository.getTenantMessageDetail(tenantId, messageId);
      if (!message) return null;
      return toV2Message(message);
    },

    async listSendAttempts(tenantId) {
      const attempts = await messageRepository.listTenantSendAttempts(tenantId);
      return attempts.map(toV2SendAttempt);
    },

    async getSendAttempt(tenantId, sendAttemptId) {
      const attempt = await messageRepository.getTenantSendAttempt(tenantId, sendAttemptId);
      if (!attempt) return null;
      return toV2SendAttempt(attempt);
    },
  };
}
