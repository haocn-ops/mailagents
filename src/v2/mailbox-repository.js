export function createV2MailboxRepository({ store }) {
  return {
    listTenantMailboxes(tenantId) {
      return store.listTenantMailboxes(tenantId);
    },

    getActiveLeaseByMailboxId(mailboxId) {
      return store.getActiveLeaseByMailboxId(mailboxId);
    },

    getTenantLeaseById(tenantId, leaseId) {
      return store.getTenantLeaseById(tenantId, leaseId);
    },

    allocateMailbox(args) {
      return store.allocateMailbox(args);
    },

    releaseMailbox(args) {
      return store.releaseMailbox(args);
    },

    saveMailboxProviderRef(mailboxId, providerRef) {
      return store.saveMailboxProviderRef(mailboxId, providerRef);
    },

    getTenantMailbox(tenantId, mailboxId) {
      return store.getTenantMailbox(tenantId, mailboxId);
    },
  };
}
