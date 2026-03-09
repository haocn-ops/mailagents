import { createV2WebhookRepository } from "./webhook-repository.js";

export function createV2WebhookReadModels({ store }) {
  const repository = createV2WebhookRepository({ store });

  return {
    async listWebhooks(tenantId) {
      return repository.listTenantWebhooks(tenantId);
    },

    async listWebhookDeliveries({ tenantId, webhookId }) {
      return repository.listTenantWebhookDeliveries(tenantId, { webhookId });
    },
  };
}
