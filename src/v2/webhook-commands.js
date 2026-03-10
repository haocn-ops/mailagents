import { createV2WebhookRepository } from "./webhook-repository.js";
import { toV2Webhook } from "./presenters.js";

export function createV2WebhookCommands({
  store,
  repository = createV2WebhookRepository({ store }),
}) {

  return {
    async createWebhook({ tenantId, eventTypes, targetUrl, secret }) {
      const webhook = await repository.createWebhook({ tenantId, eventTypes, targetUrl, secret });
      return toV2Webhook(webhook);
    },

    async rotateWebhookSecret({ tenantId, webhookId, actorDid, requestId }) {
      const webhook = await repository.getTenantWebhook(tenantId, webhookId);
      if (!webhook) return null;
      return repository.rotateTenantWebhookSecret(tenantId, webhookId, { actorDid, requestId });
    },
  };
}
