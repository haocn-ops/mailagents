export const MAILBOX_RELEASE_JOB = "mailbox.release";

export function createMailboxReleaseJob({ store, mailBackend }) {
  return async function runMailboxReleaseJob(payload) {
    const released = await mailBackend.releaseMailbox({
      tenantId: payload.tenantId,
      mailboxId: payload.mailboxId,
      address: payload.address,
      providerRef: payload.providerRef || null,
    });

    if (payload.mailboxAccountId && typeof store.markMailboxAccountReleased === "function") {
      await store.markMailboxAccountReleased(payload.mailboxAccountId);
    }
    if (payload.mailboxLeaseV2Id && typeof store.markMailboxLeaseV2Released === "function") {
      await store.markMailboxLeaseV2Released(payload.mailboxLeaseV2Id);
    }

    return {
      mailboxId: payload.mailboxId,
      address: payload.address,
      release: released || null,
    };
  };
}
