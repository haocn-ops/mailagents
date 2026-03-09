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

  async releaseLease({ tenantId, mailboxId }) {
    const mailbox = await this.store.getTenantMailbox(tenantId, mailboxId);
    if (!mailbox) return null;

    const activeLeaseV2 =
      typeof this.store.getActiveMailboxLeaseV2ByLegacyMailboxId === "function"
        ? await this.store.getActiveMailboxLeaseV2ByLegacyMailboxId(mailboxId)
        : null;
    const mailboxAccount =
      typeof this.store.upsertMailboxAccountFromLegacyMailbox === "function"
        ? await this.store.upsertMailboxAccountFromLegacyMailbox(mailbox)
        : null;

    let job;
    try {
      job = await this.queue.enqueue("mailbox.release", {
        tenantId,
        mailboxId,
        address: mailbox.address,
        providerRef: mailbox.providerRef || null,
        mailboxAccountId: mailboxAccount?.id || null,
        mailboxLeaseV2Id: activeLeaseV2?.id || null,
      });
    } catch (err) {
      err.code = err.code || "MAILBOX_RELEASE_ENQUEUE_FAILED";
      throw err;
    }

    const leaseV2 =
      activeLeaseV2 && typeof this.store.markMailboxLeaseV2Releasing === "function"
        ? await this.store.markMailboxLeaseV2Releasing(activeLeaseV2.id)
        : activeLeaseV2;

    const result = await this.store.releaseMailbox({ tenantId, mailboxId });
    if (!result) return null;

    return {
      mailbox: result.mailbox,
      lease: result.lease,
      mailboxAccount,
      leaseV2: leaseV2
        ? {
            ...activeLeaseV2,
            status: "releasing",
          }
        : activeLeaseV2,
      jobId: job.id,
      jobStatus: job.status,
      release: job.result?.release || null,
    };
  }

  async resetCredentials({ tenantId, agentId, mailboxId }) {
    const mailbox = await this.store.getTenantMailbox(tenantId, mailboxId);
    if (!mailbox) return null;

    const mailboxAccount =
      typeof this.store.upsertMailboxAccountFromLegacyMailbox === "function"
        ? await this.store.upsertMailboxAccountFromLegacyMailbox(mailbox)
        : null;

    const job = await this.queue.enqueue("mailbox.credentials.reset", {
      tenantId,
      agentId,
      mailboxId,
      address: mailbox.address,
      providerRef: mailbox.providerRef || null,
      mailboxAccountId: mailboxAccount?.id || null,
    });

    return {
      mailbox,
      mailboxAccount,
      jobId: job.id,
      jobStatus: job.status,
      credentials: job.result?.credentials || null,
    };
  }
}

export function createMailboxService(deps) {
  return new MailboxService(deps);
}
