import { createAdminRepository } from "../admin/repository.js";

export function createAdminService({
  store,
  getOverageChargeUsdc,
  getAgentAllocateHourlyLimit,
  updateRuntimeSettings,
}) {
  const repository = createAdminRepository({ store });

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
      return repository.adminOverviewMetrics();
    },

    adminOverviewTimeseries(args) {
      return repository.adminOverviewTimeseries(args);
    },

    adminListTenants(args) {
      return repository.adminListTenants(args);
    },

    adminGetTenant(tenantId) {
      return repository.adminGetTenant(tenantId);
    },

    adminPatchTenant(tenantId, body, context) {
      return repository.adminPatchTenant(tenantId, body, context);
    },

    adminListMailboxes(args) {
      return repository.adminListMailboxes(args);
    },

    adminFreezeMailbox(mailboxId, context) {
      return repository.adminFreezeMailbox(mailboxId, context);
    },

    adminReleaseMailbox(mailboxId, context) {
      return repository.adminReleaseMailbox(mailboxId, context);
    },

    adminListMessages(args) {
      return repository.adminListMessages(args);
    },

    adminReparseMessage(messageId, context) {
      return repository.adminReparseMessage(messageId, context);
    },

    adminReplayMessageWebhook(messageId, context) {
      return repository.adminReplayMessageWebhook(messageId, context);
    },

    adminListWebhooks(args) {
      return repository.adminListWebhooks(args);
    },

    adminReplayWebhook(webhookId, args) {
      return repository.adminReplayWebhook(webhookId, args);
    },

    adminRotateWebhookSecret(webhookId, context) {
      return repository.adminRotateWebhookSecret(webhookId, context);
    },

    adminListInvoices(args) {
      return repository.adminListInvoices(args);
    },

    adminIssueInvoice(invoiceId, context) {
      return repository.adminIssueInvoice(invoiceId, context);
    },

    adminListRiskEvents(args) {
      return repository.adminListRiskEvents(args);
    },

    adminUpsertRiskPolicy(args) {
      return repository.adminUpsertRiskPolicy(args);
    },

    adminListAuditLogs(args) {
      return repository.adminListAuditLogs(args);
    },
  };
}
