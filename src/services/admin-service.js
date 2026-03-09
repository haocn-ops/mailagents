export function createAdminService({
  store,
  getOverageChargeUsdc,
  getAgentAllocateHourlyLimit,
  updateRuntimeSettings,
}) {
  return {
    getLimitSettings() {
      return {
        overage_charge_usdc: getOverageChargeUsdc(),
        agent_allocate_hourly_limit: getAgentAllocateHourlyLimit(),
      };
    },

    async updateLimitSettings({ overageChargeUsdc, agentAllocateHourlyLimit }) {
      await updateRuntimeSettings({
        overageChargeUsdc,
        agentAllocateHourlyLimit,
      });
      return {
        status: "updated",
        overage_charge_usdc: getOverageChargeUsdc(),
        agent_allocate_hourly_limit: getAgentAllocateHourlyLimit(),
      };
    },

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

    adminPatchTenant(tenantId, body, ctx) {
      return store.adminPatchTenant(tenantId, body, ctx);
    },

    adminListMailboxes(args) {
      return store.adminListMailboxes(args);
    },

    adminFreezeMailbox(mailboxId, ctx) {
      return store.adminFreezeMailbox(mailboxId, ctx);
    },

    adminReleaseMailbox(mailboxId, ctx) {
      return store.adminReleaseMailbox(mailboxId, ctx);
    },

    adminListMessages(args) {
      return store.adminListMessages(args);
    },

    adminReparseMessage(messageId, ctx) {
      return store.adminReparseMessage(messageId, ctx);
    },

    adminReplayMessageWebhook(messageId, ctx) {
      return store.adminReplayMessageWebhook(messageId, ctx);
    },

    adminListWebhooks(args) {
      return store.adminListWebhooks(args);
    },

    adminReplayWebhook(webhookId, args) {
      return store.adminReplayWebhook(webhookId, args);
    },

    adminRotateWebhookSecret(webhookId, ctx) {
      return store.adminRotateWebhookSecret(webhookId, ctx);
    },

    adminListInvoices(args) {
      return store.adminListInvoices(args);
    },

    adminIssueInvoice(invoiceId, ctx) {
      return store.adminIssueInvoice(invoiceId, ctx);
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
