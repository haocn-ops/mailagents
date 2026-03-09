export const SEND_SUBMIT_JOB = "send.submit";

export function createSendSubmitJob({ mailBackend, store = null }) {
  return async function runSendSubmitJob(payload) {
    try {
      const delivery = await mailBackend.sendMailboxMessage({
        tenantId: payload.tenantId,
        agentId: payload.agentId,
        mailboxId: payload.mailboxId,
        address: payload.address,
        password: payload.mailboxPassword,
        to: payload.recipients,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      });

      if (store?.completeSendAttempt) {
        await store.completeSendAttempt({
          sendAttemptId: payload.sendAttemptId,
          backendQueueId: delivery?.messageId || null,
          smtpResponse: delivery?.response || null,
        });
      }

      return {
        sendAttemptId: payload.sendAttemptId,
        mailboxId: payload.mailboxId,
        from: payload.address,
        delivery,
      };
    } catch (err) {
      if (store?.failSendAttempt) {
        await store.failSendAttempt({
          sendAttemptId: payload.sendAttemptId,
          errorMessage: err.message || "send failed",
        });
      }
      throw err;
    }
  };
}
