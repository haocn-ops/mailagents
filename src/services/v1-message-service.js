import { createV1TenantRepository } from "../v1/repository.js";

export function createV1MessageService({ store, mailBackend }) {
  const repository = createV1TenantRepository({ store });

  return {
    async getLatestMessages({ tenantId, mailboxId, since, limit }) {
      return repository.getLatestMessages({
        tenantId,
        mailboxId,
        since,
        limit,
      });
    },

    async sendMessage({ tenantId, agentId, mailboxId, recipients, subject, text, html, mailboxPassword }) {
      const mailbox = await repository.getTenantMailbox(tenantId, mailboxId);
      if (!mailbox) return null;

      const delivery = await mailBackend.sendMailboxMessage({
        tenantId,
        agentId,
        mailboxId,
        address: mailbox.address,
        password: mailboxPassword,
        to: recipients,
        subject,
        text,
        html,
      });

      return {
        mailbox_id: mailbox.id,
        from: mailbox.address,
        accepted: delivery?.accepted || [],
        rejected: delivery?.rejected || [],
        message_id: delivery?.messageId || null,
        envelope: delivery?.envelope || null,
        response: delivery?.response || null,
      };
    },

    async getMessageDetail(tenantId, messageId) {
      return repository.getTenantMessageDetail(tenantId, messageId);
    },
  };
}
