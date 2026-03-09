export function createV1MessageService({ store, mailBackend }) {
  return {
    async getLatestMessages({ tenantId, mailboxId, since, limit }) {
      return store.getLatestMessages({
        tenantId,
        mailboxId,
        since,
        limit,
      });
    },

    async sendMessage({ tenantId, agentId, mailboxId, recipients, subject, text, html, mailboxPassword }) {
      const mailbox = await store.getTenantMailbox(tenantId, mailboxId);
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
      return store.getTenantMessageDetail(tenantId, messageId);
    },
  };
}
