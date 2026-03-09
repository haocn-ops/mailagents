export function createV1TenantRepository({ store }) {
  return {
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

    listTenantMailboxes(tenantId) {
      return store.listTenantMailboxes(tenantId);
    },

    getLatestMessages(args) {
      return store.getLatestMessages(args);
    },

    getTenantMessageDetail(tenantId, messageId) {
      return store.getTenantMessageDetail(tenantId, messageId);
    },

    createWebhook(args) {
      return store.createWebhook(args);
    },

    listTenantWebhooks(tenantId) {
      return store.listTenantWebhooks(tenantId);
    },

    usageSummary(tenantId, start, end) {
      return store.usageSummary(tenantId, start, end);
    },

    getInvoice(invoiceId, tenantId) {
      return store.getInvoice(invoiceId, tenantId);
    },

    listTenantInvoices(tenantId, period) {
      return store.listTenantInvoices(tenantId, period);
    },
  };
}
