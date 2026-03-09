import { randomUUID } from "node:crypto";

export class SendService {
  constructor({ store, queue }) {
    this.store = store;
    this.queue = queue;
  }

  async queueSend({ tenantId, agentId, mailboxId, recipients, subject, text, html, mailboxPassword }) {
    const mailbox = await this.store.getTenantMailbox(tenantId, mailboxId);
    if (!mailbox) return null;

    const mailboxAccount =
      typeof this.store.upsertMailboxAccountFromLegacyMailbox === "function"
        ? await this.store.upsertMailboxAccountFromLegacyMailbox(mailbox)
        : null;
    const sendAttempt =
      typeof this.store.createSendAttempt === "function"
        ? await this.store.createSendAttempt({
            tenantId,
            agentId,
            mailboxAccountId: mailboxAccount?.id || mailbox.id,
            legacyMailboxId: mailbox.id,
            fromAddress: mailbox.address,
            to: recipients,
            subject,
          })
        : { id: randomUUID(), status: "queued" };
    const sendAttemptId = sendAttempt.id;

    const job = await this.queue.enqueue("send.submit", {
      sendAttemptId,
      store: this.store,
      tenantId,
      agentId,
      mailboxId,
      address: mailbox.address,
      mailboxAccountId: mailboxAccount?.id || null,
      recipients,
      subject,
      text,
      html,
      mailboxPassword,
    });

    return {
      sendAttemptId,
      mailbox,
      mailboxAccount,
      jobId: job.id,
      jobStatus: job.status,
      delivery: job.result?.delivery || null,
    };
  }
}

export function createSendService(deps) {
  return new SendService(deps);
}
