import { createV2TenantReadModels } from "../v2/tenant-read-models.js";
import { createV2TenantCommands } from "../v2/tenant-commands.js";

export function createV2MessageService({
  store,
  mailBackend,
  readModels = createV2TenantReadModels({ store }),
  commands = createV2TenantCommands({ store, mailBackend }),
}) {

  return {
    async listMessages({ tenantId, mailboxId, since, limit }) {
      return readModels.listMessages({ tenantId, mailboxId, since, limit });
    },

    async getMessage(tenantId, messageId) {
      return readModels.getMessage(tenantId, messageId);
    },

    async sendMessage({ tenantId, agentId, mailboxId, mailboxPassword, recipients, subject, text, html, requestId }) {
      return commands.sendMessage({
        tenantId,
        agentId,
        mailboxId,
        mailboxPassword,
        recipients,
        subject,
        text,
        html,
        requestId,
      });
    },

    async listSendAttempts(tenantId) {
      return readModels.listSendAttempts(tenantId);
    },

    async getSendAttempt(tenantId, sendAttemptId) {
      return readModels.getSendAttempt(tenantId, sendAttemptId);
    },
  };
}
