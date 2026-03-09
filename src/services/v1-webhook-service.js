import { parsePeriod } from "../utils.js";

export function createV1WebhookService({ store }) {
  return {
    async createWebhook({ tenantId, eventTypes, targetUrl, secret }) {
      const webhook = await store.createWebhook({
        tenantId,
        eventTypes,
        targetUrl,
        secret,
      });

      return {
        webhook_id: webhook.id,
        event_types: webhook.eventTypes,
        target_url: webhook.targetUrl,
        status: webhook.status,
      };
    },

    async listWebhooks(tenantId) {
      return store.listTenantWebhooks(tenantId);
    },

    async getUsageSummary(tenantId, period) {
      const parsed = parsePeriod(period);
      if (!parsed) return null;

      const summary = await store.usageSummary(tenantId, parsed.start, parsed.end);
      return {
        period,
        api_calls: summary.api_calls,
        active_mailboxes: summary.active_mailboxes,
        message_parses: summary.message_parses,
        billable_units: summary.billable_units,
      };
    },

    async getInvoice(tenantId, invoiceId) {
      const invoice = await store.getInvoice(invoiceId, tenantId);
      if (!invoice) return null;

      return {
        invoice_id: invoice.id,
        tenant_id: invoice.tenantId,
        period_start: invoice.periodStart,
        period_end: invoice.periodEnd,
        amount_usdc: invoice.amountUsdc,
        status: invoice.status,
        statement_hash: invoice.statementHash,
        settlement_tx_hash: invoice.settlementTxHash,
      };
    },

    async listInvoices(tenantId, period) {
      return store.listTenantInvoices(tenantId, period);
    },
  };
}
