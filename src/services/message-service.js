import { createV2TenantReadModels } from "../v2/tenant-read-models.js";

export function createMessageService({ store, mailBackend }) {
  const readModels = createV2TenantReadModels({ store });

  return {
    async listMessages({ tenantId, mailboxId, since, limit }) {
      return readModels.listMessages({ tenantId, mailboxId, since, limit });
    },

    async getMessage(tenantId, messageId) {
      return readModels.getMessage(tenantId, messageId);
    },

    async sendMessage({ tenantId, agentId, mailboxId, mailboxPassword, recipients, subject, text, html, requestId }) {
      const mailbox = await store.getTenantMailbox(tenantId, mailboxId);
      if (!mailbox) return null;

      const attempt = await store.createSendAttempt({
        tenantId,
        agentId,
        mailboxId,
        to: recipients,
        subject,
        text,
        html,
        requestId,
      });

      try {
        const delivery = await mailBackend.sendMailboxMessage({
          tenantId,
          agentId,
          mailboxId,
          address: mailbox.address,
          password: mailboxPassword,
          to: recipients,
          subject,
          text,
          html,
        });
        await store.completeSendAttempt(attempt.send_attempt_id, delivery, { requestId });
      } catch (err) {
        await store.failSendAttempt(attempt.send_attempt_id, err.message || "Mail backend send failed", { requestId });
        err.sendAttemptId = attempt.send_attempt_id;
        throw err;
      }

      const completedAttempt = await store.getTenantSendAttempt(tenantId, attempt.send_attempt_id);
      return {
        send_attempt_id: completedAttempt?.send_attempt_id || attempt.send_attempt_id,
        submission_status: completedAttempt?.submission_status || "accepted",
        accepted: completedAttempt?.accepted || [],
        rejected: completedAttempt?.rejected || [],
        message_id: completedAttempt?.message_id || null,
        response: completedAttempt?.response || null,
      };
    },

    async listSendAttempts(tenantId) {
      return readModels.listSendAttempts(tenantId);
    },

    async getSendAttempt(tenantId, sendAttemptId) {
      return readModels.getSendAttempt(tenantId, sendAttemptId);
    },
  };
}
