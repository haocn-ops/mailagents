import { createV2TenantReadModels } from "../v2/tenant-read-models.js";
import { createV2TenantCommands } from "../v2/tenant-commands.js";

export function createV2WebhookService({ store }) {
  const readModels = createV2TenantReadModels({ store });
  const commands = createV2TenantCommands({ store });

  return {
    async createWebhook({ tenantId, eventTypes, targetUrl, secret }) {
      return commands.createWebhook({ tenantId, eventTypes, targetUrl, secret });
    },

    async listWebhooks(tenantId) {
      return readModels.listWebhooks(tenantId);
    },

    async rotateWebhookSecret({ tenantId, webhookId, actorDid, requestId }) {
      return commands.rotateWebhookSecret({ tenantId, webhookId, actorDid, requestId });
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
