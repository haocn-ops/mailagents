import { createV2BillingReadModels } from "../v2/billing-read-models.js";

export function createV2BillingService({
  store,
  readModels = createV2BillingReadModels({ store }),
}) {

  return {
    async getUsageSummary({ tenantId, period }) {
      return readModels.getUsageSummary({ tenantId, period });
    },

    async listInvoices({ tenantId, period }) {
      return readModels.listInvoices({ tenantId, period });
    },

    async getInvoice({ tenantId, invoiceId }) {
      return readModels.getInvoice({ tenantId, invoiceId });
    },
  };
}
