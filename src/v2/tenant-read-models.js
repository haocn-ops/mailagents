import { createV2MailboxRepository } from "./mailbox-repository.js";
import { createV2MessageRepository } from "./message-repository.js";
import {
  toV2MailboxAccount,
  toV2MailboxLease,
  toV2Message,
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
      return messageRepository.listTenantSendAttempts(tenantId);
    },

    async getSendAttempt(tenantId, sendAttemptId) {
      return messageRepository.getTenantSendAttempt(tenantId, sendAttemptId);
    },
  };
}
