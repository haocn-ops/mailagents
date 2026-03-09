import { parsePeriod } from "../utils.js";
import { createV2BillingRepository } from "./billing-repository.js";
import { toV2Invoice } from "./presenters.js";

export function createV2BillingReadModels({ store }) {
  const repository = createV2BillingRepository({ store });

  return {
    async getUsageSummary({ tenantId, period }) {
      const parsed = parsePeriod(period);
      if (!parsed) return null;

      const summary = await repository.usageSummary(tenantId, parsed.start, parsed.end);
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
      return repository.listTenantInvoices(tenantId, period);
    },

    async getInvoice({ tenantId, invoiceId }) {
      const invoice = await repository.getInvoice(invoiceId, tenantId);
      if (!invoice) return null;
      return toV2Invoice(invoice);
    },
  };
}
