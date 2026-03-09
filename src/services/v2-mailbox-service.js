import { createV2TenantReadModels } from "../v2/tenant-read-models.js";
import {
  toV2AllocatedLease,
  toV2MailboxCredentials,
  toV2ReleasedLease,
} from "../v2/presenters.js";

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

      return toV2AllocatedLease({
        lease: result.lease,
        mailbox: result.mailbox,
        provider,
      });
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

      return toV2ReleasedLease({ leaseId, mailboxId: lease.mailboxId });
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

      return toV2MailboxCredentials({ mailbox, credentials });
    },
  };
}
