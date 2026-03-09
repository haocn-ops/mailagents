export function createV1MailboxService({ store, mailBackend }) {
  return {
    async allocateMailbox({ tenantId, agentId, purpose, ttlHours }) {
      const result = await store.allocateMailbox({
        tenantId,
        agentId,
        purpose,
        ttlHours,
      });
      if (!result) return null;

      let provider = null;
      try {
        provider = await mailBackend.provisionMailbox({
          tenantId,
          agentId,
          mailboxId: result.mailbox.id,
          address: result.mailbox.address,
          ttlHours,
        });
        if (provider?.providerRef) {
          await store.saveMailboxProviderRef(result.mailbox.id, provider.providerRef);
        }
      } catch (err) {
        await store.releaseMailbox({ tenantId, mailboxId: result.mailbox.id });
        throw err;
      }

      return {
        mailbox_id: result.mailbox.id,
        address: result.mailbox.address,
        lease_expires_at: result.lease.expiresAt,
        webmail_login: provider?.credentials?.login || null,
        webmail_password: provider?.credentials?.password || null,
        webmail_url: provider?.credentials?.webmailUrl || null,
      };
    },

    async releaseMailbox({ tenantId, mailboxId }) {
      const result = await store.releaseMailbox({ tenantId, mailboxId });
      if (!result) return null;

      await mailBackend.releaseMailbox({
        tenantId,
        mailboxId,
        address: result.mailbox.address,
        providerRef: result.mailbox.providerRef || null,
      });

      return { mailbox_id: mailboxId, status: "released" };
    },

    async resetMailboxCredentials({ tenantId, agentId, mailboxId }) {
      const mailbox = await store.getTenantMailbox(tenantId, mailboxId);
      if (!mailbox) return null;

      const credentials = await mailBackend.issueMailboxCredentials({
        tenantId,
        agentId,
        mailboxId,
        address: mailbox.address,
        providerRef: mailbox.providerRef || null,
      });

      return {
        mailbox_id: mailbox.id,
        address: mailbox.address,
        webmail_login: credentials?.login || mailbox.address,
        webmail_password: credentials?.password || null,
        webmail_url: credentials?.webmailUrl || null,
      };
    },

    async listMailboxes(tenantId) {
      return store.listTenantMailboxes(tenantId);
    },
  };
}
