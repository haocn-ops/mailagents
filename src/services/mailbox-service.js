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

    const mailboxAccount =
      typeof this.store.upsertMailboxAccountFromLegacyMailbox === "function"
        ? await this.store.upsertMailboxAccountFromLegacyMailbox(result.mailbox)
        : null;
    const leaseRecord =
      mailboxAccount && typeof this.store.createMailboxLeaseV2 === "function"
        ? await this.store.createMailboxLeaseV2({
            mailboxAccountId: mailboxAccount.id,
            tenantId,
            agentId,
            purpose,
            endsAt: result.lease.expiresAt,
          })
        : null;

    try {
      const job = await this.queue.enqueue("mailbox.provision", {
        tenantId,
        agentId,
        mailboxId: result.mailbox.id,
        address: result.mailbox.address,
        ttlHours,
        mailboxAccountId: mailboxAccount?.id || null,
        mailboxLeaseV2Id: leaseRecord?.id || null,
      });

      return {
        mailbox: result.mailbox,
        lease: result.lease,
        mailboxAccount,
        leaseV2: leaseRecord,
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
