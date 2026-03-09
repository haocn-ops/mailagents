export function createV2WebhookRepository({ store }) {
  return {
    createWebhook(args) {
      return store.createWebhook(args);
    },

    listTenantWebhooks(tenantId) {
      return store.listTenantWebhooks(tenantId);
    },

    getTenantWebhook(tenantId, webhookId) {
      return store.getTenantWebhook(tenantId, webhookId);
    },

    rotateTenantWebhookSecret(tenantId, webhookId, context) {
      return store.rotateTenantWebhookSecret(tenantId, webhookId, context);
    },

    listTenantWebhookDeliveries(tenantId, options) {
      return store.listTenantWebhookDeliveries(tenantId, options);
    },
  };
}
