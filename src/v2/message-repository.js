export function createV2MessageRepository({ store }) {
  return {
    getLatestMessages(args) {
      return store.getLatestMessages(args);
    },

    getTenantMessageDetail(tenantId, messageId) {
      return store.getTenantMessageDetail(tenantId, messageId);
    },

    createSendAttempt(args) {
      return store.createSendAttempt(args);
    },

    completeSendAttempt(sendAttemptId, delivery, context) {
      return store.completeSendAttempt(sendAttemptId, delivery, context);
    },

    failSendAttempt(sendAttemptId, reason, context) {
      return store.failSendAttempt(sendAttemptId, reason, context);
    },

    listTenantSendAttempts(tenantId) {
      return store.listTenantSendAttempts(tenantId);
    },

    getTenantSendAttempt(tenantId, sendAttemptId) {
      return store.getTenantSendAttempt(tenantId, sendAttemptId);
    },

    getTenantMailbox(tenantId, mailboxId) {
      return store.getTenantMailbox(tenantId, mailboxId);
    },
  };
}
