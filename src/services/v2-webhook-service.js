import { createV2WebhookCommands } from "../v2/webhook-commands.js";
import { createV2WebhookReadModels } from "../v2/webhook-read-models.js";

export function createV2WebhookService({
  store,
  readModels = createV2WebhookReadModels({ store }),
  commands = createV2WebhookCommands({ store }),
}) {

  return {
    async createWebhook({ tenantId, eventTypes, targetUrl, secret }) {
      return commands.createWebhook({ tenantId, eventTypes, targetUrl, secret });
    },

    async listWebhooks(tenantId) {
      return readModels.listWebhooks(tenantId);
    },

    async getWebhook(tenantId, webhookId) {
      return readModels.getWebhook(tenantId, webhookId);
    },

    async rotateWebhookSecret({ tenantId, webhookId, actorDid, requestId }) {
      return commands.rotateWebhookSecret({ tenantId, webhookId, actorDid, requestId });
    },

    async listWebhookDeliveries({ tenantId, webhookId }) {
      return readModels.listWebhookDeliveries({ tenantId, webhookId });
    },
  };
}
