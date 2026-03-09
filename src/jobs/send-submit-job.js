export const SEND_SUBMIT_JOB = "send.submit";

export function createSendSubmitJob({ mailBackend }) {
  return async function runSendSubmitJob(payload) {
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

    return {
      sendAttemptId: payload.sendAttemptId,
      mailboxId: payload.mailboxId,
      from: payload.address,
      delivery,
    };
  };
}
