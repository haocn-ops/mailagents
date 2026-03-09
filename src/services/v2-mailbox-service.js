import { createV2TenantReadModels } from "../v2/tenant-read-models.js";

export function createV2MailboxService({ store, mailBackend }) {
  const readModels = createV2TenantReadModels({ store });

  return {
    async listAccounts(tenantId) {
      return readModels.listMailboxAccounts(tenantId);
    },

    async listLeases(tenantId) {
      return readModels.listMailboxLeases(tenantId);
    },

    async allocateLease({ tenantId, agentId, purpose, ttlHours }) {
      const result = await store.allocateMailbox({ tenantId, agentId, purpose, ttlHours });
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
        lease_id: result.lease.id,
        mailbox_id: result.mailbox.id,
        account_id: result.mailbox.id,
        address: result.mailbox.address,
        lease_status: result.lease.status,
        expires_at: result.lease.expiresAt,
        webmail_login: provider?.credentials?.login || null,
        webmail_password: provider?.credentials?.password || null,
        webmail_url: provider?.credentials?.webmailUrl || null,
      };
    },

    async releaseLease({ tenantId, leaseId }) {
      const lease = await store.getTenantLeaseById(tenantId, leaseId);
      if (!lease) return null;

      const result = await store.releaseMailbox({ tenantId, mailboxId: lease.mailboxId });
      if (!result) return null;

      await mailBackend.releaseMailbox({
        tenantId,
        mailboxId: lease.mailboxId,
        address: result.mailbox.address,
        providerRef: result.mailbox.providerRef || null,
      });

      return { lease_id: leaseId, mailbox_id: lease.mailboxId, lease_status: "released" };
    },

    async resetCredentials({ tenantId, agentId, accountId }) {
      const mailbox = await store.getTenantMailbox(tenantId, accountId);
      if (!mailbox) return null;

      const credentials = await mailBackend.issueMailboxCredentials({
        tenantId,
        agentId,
        mailboxId: accountId,
        address: mailbox.address,
        providerRef: mailbox.providerRef || null,
      });

      return {
        account_id: mailbox.id,
        mailbox_id: mailbox.id,
        address: mailbox.address,
        webmail_login: credentials?.login || mailbox.address,
        webmail_password: credentials?.password || null,
        webmail_url: credentials?.webmailUrl || null,
      };
    },
  };
}
