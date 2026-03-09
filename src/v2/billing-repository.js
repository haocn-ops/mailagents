export function createV2BillingRepository({ store }) {
  return {
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
