function toV2MailboxAccount(mailbox, lease = null) {
  return {
    account_id: mailbox.mailbox_id,
    mailbox_id: mailbox.mailbox_id,
    address: mailbox.address,
    account_status: mailbox.status === "leased" ? "active" : mailbox.status,
    lease_status: lease?.status || null,
    lease_id: lease?.id || null,
    lease_expires_at: mailbox.lease_expires_at || lease?.expiresAt || null,
    provider_ref: mailbox.provider_ref || null,
    updated_at: mailbox.updated_at || null,
  };
}

function toV2MailboxLease(mailbox, lease) {
  return {
    lease_id: lease.id,
    mailbox_id: mailbox.mailbox_id,
    account_id: mailbox.mailbox_id,
    address: mailbox.address,
    agent_id: lease.agentId,
    purpose: lease.purpose,
    lease_status: lease.status,
    started_at: lease.startedAt,
    expires_at: lease.expiresAt,
    released_at: lease.releasedAt || null,
  };
}

export function createV2MailboxService({ store, mailBackend }) {
  return {
    async listAccounts(tenantId) {
      const mailboxes = await store.listTenantMailboxes(tenantId);
      const items = [];
      for (const mailbox of mailboxes) {
        const lease = await store.getActiveLeaseByMailboxId(mailbox.mailbox_id);
        items.push(toV2MailboxAccount(mailbox, lease));
      }
      return items;
    },

    async listLeases(tenantId) {
      const mailboxes = await store.listTenantMailboxes(tenantId);
      const items = [];
      for (const mailbox of mailboxes) {
        const lease = await store.getActiveLeaseByMailboxId(mailbox.mailbox_id);
        if (lease) items.push(toV2MailboxLease(mailbox, lease));
      }
      return items;
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
