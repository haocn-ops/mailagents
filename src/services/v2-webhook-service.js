import { createV2TenantReadModels } from "../v2/tenant-read-models.js";

export function createV2WebhookService({ store }) {
  const readModels = createV2TenantReadModels({ store });

  return {
    async createWebhook({ tenantId, eventTypes, targetUrl, secret }) {
      return store.createWebhook({ tenantId, eventTypes, targetUrl, secret });
    },

    async listWebhooks(tenantId) {
      return readModels.listWebhooks(tenantId);
    },

    async rotateWebhookSecret({ tenantId, webhookId, actorDid, requestId }) {
      const webhook = await store.getTenantWebhook(tenantId, webhookId);
      if (!webhook) return null;
      return store.rotateTenantWebhookSecret(tenantId, webhookId, { actorDid, requestId });
    },

    async listWebhookDeliveries({ tenantId, webhookId }) {
      return readModels.listWebhookDeliveries({ tenantId, webhookId });
    },

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
