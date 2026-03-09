import { randomUUID } from "node:crypto";

export class SendService {
  constructor({ store, queue }) {
    this.store = store;
    this.queue = queue;
  }

  async queueSend({ tenantId, agentId, mailboxId, recipients, subject, text, html, mailboxPassword }) {
    const mailbox = await this.store.getTenantMailbox(tenantId, mailboxId);
    if (!mailbox) return null;

    const sendAttemptId = randomUUID();
    const job = await this.queue.enqueue("send.submit", {
      sendAttemptId,
      tenantId,
      agentId,
      mailboxId,
      address: mailbox.address,
      recipients,
      subject,
      text,
      html,
      mailboxPassword,
    });

    return {
      sendAttemptId,
      mailbox,
      jobId: job.id,
      jobStatus: job.status,
      delivery: job.result?.delivery || null,
    };
  }
}

export function createSendService(deps) {
  return new SendService(deps);
}
