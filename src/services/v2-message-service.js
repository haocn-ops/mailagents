function toV2Message(message) {
  const parsedStatus = message.parsed_status || (message.otp_code || message.verification_link ? "parsed" : "pending");
  return {
    message_id: message.message_id,
    mailbox_id: message.mailbox_id,
    sender: message.sender,
    sender_domain: message.sender_domain,
    subject: message.subject,
    raw_ref: message.raw_ref || null,
    received_at: message.received_at,
    otp_code: message.otp_code || null,
    verification_link: message.verification_link || null,
    parsed_status: parsedStatus,
  };
}

export function createV2MessageService({ store, mailBackend }) {
  return {
    async listMessages({ tenantId, mailboxId, since, limit }) {
      const messages = await store.getLatestMessages({ tenantId, mailboxId, since, limit });
      if (messages === null) return null;
      return messages.map(toV2Message);
    },

    async getMessage(tenantId, messageId) {
      const message = await store.getTenantMessageDetail(tenantId, messageId);
      if (!message) return null;
      return toV2Message(message);
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
      return store.listTenantSendAttempts(tenantId);
    },

    async getSendAttempt(tenantId, sendAttemptId) {
      return store.getTenantSendAttempt(tenantId, sendAttemptId);
    },
  };
}
