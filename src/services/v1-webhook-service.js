import { parsePeriod } from "../utils.js";
import { createV1TenantRepository } from "../v1/repository.js";

export function createV1WebhookService({ store }) {
  const repository = createV1TenantRepository({ store });

  return {
    async createWebhook({ tenantId, eventTypes, targetUrl, secret }) {
      const webhook = await repository.createWebhook({
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
      return repository.listTenantWebhooks(tenantId);
    },

    async getUsageSummary(tenantId, period) {
      const parsed = parsePeriod(period);
      if (!parsed) return null;

      const summary = await repository.usageSummary(tenantId, parsed.start, parsed.end);
      return {
        period,
        api_calls: summary.api_calls,
        active_mailboxes: summary.active_mailboxes,
        message_parses: summary.message_parses,
        billable_units: summary.billable_units,
      };
    },

    async getInvoice(tenantId, invoiceId) {
      const invoice = await repository.getInvoice(invoiceId, tenantId);
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
      return repository.listTenantInvoices(tenantId, period);
    },
  };
}
