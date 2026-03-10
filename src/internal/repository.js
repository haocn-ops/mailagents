export function createInternalRepository({ store }) {
  return {
    findMailboxByAddress(address) {
      return store.findMailboxByAddress(address);
    },

    ingestInboundMessage(args) {
      return store.ingestInboundMessage(args);
    },

    applyMessageParseResult(args) {
      return store.applyMessageParseResult(args);
    },

    getMessage(messageId) {
      return store.getMessage(messageId);
    },

    getWebhook(webhookId) {
      return store.getWebhook(webhookId);
    },

    listActiveWebhooksByEvent(tenantId, eventType) {
      return store.listActiveWebhooksByEvent(tenantId, eventType);
    },

    recordWebhookDelivery(webhookId, args) {
      return store.recordWebhookDelivery(webhookId, args);
    },

    saveMailboxProviderRef(mailboxId, providerRef) {
      return store.saveMailboxProviderRef(mailboxId, providerRef);
    },

    recordMailboxBackendEvent(args) {
      return store.recordMailboxBackendEvent(args);
    },

    getActiveLeaseByMailboxId(mailboxId) {
      return store.getActiveLeaseByMailboxId(mailboxId);
    },
  };
}
