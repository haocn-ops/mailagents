export class MailboxService {
  constructor({ store, queue }) {
    this.store = store;
    this.queue = queue;
  }

  async requestLease({ tenantId, agentId, purpose, ttlHours }) {
    const result = await this.store.allocateMailbox({
      tenantId,
      agentId,
      purpose,
      ttlHours,
    });

    if (!result) {
      return null;
    }

    try {
      const job = await this.queue.enqueue("mailbox.provision", {
        tenantId,
        agentId,
        mailboxId: result.mailbox.id,
        address: result.mailbox.address,
        ttlHours,
      });

      return {
        mailbox: result.mailbox,
        lease: result.lease,
        jobId: job.id,
        jobStatus: job.status,
        provider: job.result,
      };
    } catch (err) {
      await this.store.releaseMailbox({ tenantId, mailboxId: result.mailbox.id });
      err.code = err.code || "MAILBOX_PROVISION_FAILED";
      throw err;
    }
  }
}

export function createMailboxService(deps) {
  return new MailboxService(deps);
}
