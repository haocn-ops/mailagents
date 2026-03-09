export function createAdminRepository({ store }) {
  return {
    adminOverviewMetrics() {
      return store.adminOverviewMetrics();
    },

    adminOverviewTimeseries(args) {
      return store.adminOverviewTimeseries(args);
    },

    adminListTenants(args) {
      return store.adminListTenants(args);
    },

    adminGetTenant(tenantId) {
      return store.adminGetTenant(tenantId);
    },

    adminPatchTenant(tenantId, body, context) {
      return store.adminPatchTenant(tenantId, body, context);
    },

    adminListMailboxes(args) {
      return store.adminListMailboxes(args);
    },

    adminFreezeMailbox(mailboxId, context) {
      return store.adminFreezeMailbox(mailboxId, context);
    },

    adminReleaseMailbox(mailboxId, context) {
      return store.adminReleaseMailbox(mailboxId, context);
    },

    adminListMessages(args) {
      return store.adminListMessages(args);
    },

    adminReparseMessage(messageId, context) {
      return store.adminReparseMessage(messageId, context);
    },

    adminReplayMessageWebhook(messageId, context) {
      return store.adminReplayMessageWebhook(messageId, context);
    },

    adminListWebhooks(args) {
      return store.adminListWebhooks(args);
    },

    adminReplayWebhook(webhookId, args) {
      return store.adminReplayWebhook(webhookId, args);
    },

    adminRotateWebhookSecret(webhookId, context) {
      return store.adminRotateWebhookSecret(webhookId, context);
    },

    adminListInvoices(args) {
      return store.adminListInvoices(args);
    },

    adminIssueInvoice(invoiceId, context) {
      return store.adminIssueInvoice(invoiceId, context);
    },

    adminListRiskEvents(args) {
      return store.adminListRiskEvents(args);
    },

    adminUpsertRiskPolicy(args) {
      return store.adminUpsertRiskPolicy(args);
    },

    adminListAuditLogs(args) {
      return store.adminListAuditLogs(args);
    },
  };
}
