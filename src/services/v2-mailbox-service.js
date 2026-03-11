import { createV2TenantReadModels } from "../v2/tenant-read-models.js";
import { createV2TenantCommands } from "../v2/tenant-commands.js";

export function createV2MailboxService({
  store,
  mailBackend,
  readModels = createV2TenantReadModels({ store }),
  commands = createV2TenantCommands({ store, mailBackend }),
}) {

  return {
    async listAccounts(tenantId) {
      return readModels.listMailboxAccounts(tenantId);
    },

    async listLeases(tenantId) {
      return readModels.listMailboxLeases(tenantId);
    },

    async getLease(tenantId, leaseId) {
      return readModels.getMailboxLease(tenantId, leaseId);
    },

    async allocateLease({ tenantId, agentId, purpose, ttlHours }) {
      return commands.allocateLease({ tenantId, agentId, purpose, ttlHours });
    },

    async releaseLease({ tenantId, leaseId }) {
      return commands.releaseLease({ tenantId, leaseId });
    },

    async resetCredentials({ tenantId, agentId, accountId }) {
      return commands.resetMailboxCredentials({ tenantId, agentId, accountId });
    },
  };
}
