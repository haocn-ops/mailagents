export const MAILBOX_PROVISION_JOB = "mailbox.provision";

export function createMailboxProvisionJob({ store, mailBackend }) {
  return async function runMailboxProvisionJob(payload) {
    const provisioned = await mailBackend.provisionMailbox({
      tenantId: payload.tenantId,
      agentId: payload.agentId,
      mailboxId: payload.mailboxId,
      address: payload.address,
      ttlHours: payload.ttlHours,
    });

    if (provisioned?.providerRef) {
      await store.saveMailboxProviderRef(payload.mailboxId, provisioned.providerRef);
    }
    if (payload.mailboxAccountId && typeof store.markMailboxAccountProvisioned === "function") {
      await store.markMailboxAccountProvisioned({
        mailboxAccountId: payload.mailboxAccountId,
        providerRef: provisioned?.providerRef || null,
      });
    }
    if (payload.mailboxLeaseV2Id && typeof store.markMailboxLeaseV2Active === "function") {
      await store.markMailboxLeaseV2Active(payload.mailboxLeaseV2Id);
    }

    return {
      mailboxId: payload.mailboxId,
      address: payload.address,
      providerRef: provisioned?.providerRef || null,
      credentials: provisioned?.credentials || null,
    };
  };
}
