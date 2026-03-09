export function createV2TenantRepository({ store }) {
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

    getLatestMessages(args) {
      return store.getLatestMessages(args);
    },

    getTenantMessageDetail(tenantId, messageId) {
      return store.getTenantMessageDetail(tenantId, messageId);
    },

    createSendAttempt(args) {
      return store.createSendAttempt(args);
    },

    completeSendAttempt(sendAttemptId, delivery, context) {
      return store.completeSendAttempt(sendAttemptId, delivery, context);
    },

    failSendAttempt(sendAttemptId, reason, context) {
      return store.failSendAttempt(sendAttemptId, reason, context);
    },

    listTenantSendAttempts(tenantId) {
      return store.listTenantSendAttempts(tenantId);
    },

    getTenantSendAttempt(tenantId, sendAttemptId) {
      return store.getTenantSendAttempt(tenantId, sendAttemptId);
    },

    createWebhook(args) {
      return store.createWebhook(args);
    },

    listTenantWebhooks(tenantId) {
      return store.listTenantWebhooks(tenantId);
    },

    getTenantWebhook(tenantId, webhookId) {
      return store.getTenantWebhook(tenantId, webhookId);
    },

    rotateTenantWebhookSecret(tenantId, webhookId, context) {
      return store.rotateTenantWebhookSecret(tenantId, webhookId, context);
    },

    listTenantWebhookDeliveries(tenantId, options) {
      return store.listTenantWebhookDeliveries(tenantId, options);
    },

    usageSummary(tenantId, start, end) {
      return store.usageSummary(tenantId, start, end);
    },

    listTenantInvoices(tenantId, period) {
      return store.listTenantInvoices(tenantId, period);
    },

    getInvoice(invoiceId, tenantId) {
      return store.getInvoice(invoiceId, tenantId);
    },
  };
}
