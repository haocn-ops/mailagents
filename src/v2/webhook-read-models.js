import { createV2WebhookRepository } from "./webhook-repository.js";
import { toV2Webhook, toV2WebhookDelivery } from "./presenters.js";

export function createV2WebhookReadModels({
  store,
  repository = createV2WebhookRepository({ store }),
}) {

  return {
    async listWebhooks(tenantId) {
      const items = await repository.listTenantWebhooks(tenantId);
      return items.map(toV2Webhook);
    },

    async getWebhook(tenantId, webhookId) {
      const webhook = await repository.getTenantWebhook(tenantId, webhookId);
      if (!webhook) return null;
      return toV2Webhook(webhook);
    },

    async listWebhookDeliveries({ tenantId, webhookId }) {
      const items = await repository.listTenantWebhookDeliveries(tenantId, { webhookId });
      return items.map(toV2WebhookDelivery);
    },

    async getWebhookDelivery({ tenantId, deliveryId }) {
      const items = await repository.listTenantWebhookDeliveries(tenantId, {});
      const delivery = items.find((item) => item.delivery_id === deliveryId);
      if (!delivery) return null;
      return toV2WebhookDelivery(delivery);
    },
  };
}
