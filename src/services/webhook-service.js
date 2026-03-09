import { parsePeriod } from "../utils.js";

export function createWebhookService({ store }) {
  return {
    async createWebhook({ tenantId, eventTypes, targetUrl, secret }) {
      return store.createWebhook({ tenantId, eventTypes, targetUrl, secret });
    },

    async listWebhooks(tenantId) {
      return store.listTenantWebhooks(tenantId);
    },

    async rotateWebhookSecret({ tenantId, webhookId, actorDid, requestId }) {
      const webhook = await store.getTenantWebhook(tenantId, webhookId);
      if (!webhook) return null;
      return store.rotateTenantWebhookSecret(tenantId, webhookId, { actorDid, requestId });
    },

    async listWebhookDeliveries({ tenantId, webhookId }) {
      return store.listTenantWebhookDeliveries(tenantId, { webhookId });
    },

    async getUsageSummary({ tenantId, period }) {
      const parsed = parsePeriod(period);
      if (!parsed) return null;

      const summary = await store.usageSummary(tenantId, parsed.start, parsed.end);
      return {
        period,
        usage: {
          api_calls: summary.api_calls,
          active_mailboxes: summary.active_mailboxes,
          message_parses: summary.message_parses,
          billable_units: summary.billable_units,
        },
      };
    },

    async listInvoices({ tenantId, period }) {
      return store.listTenantInvoices(tenantId, period);
    },

    async getInvoice({ tenantId, invoiceId }) {
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
  };
}
