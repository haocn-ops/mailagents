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

    return {
      mailboxId: payload.mailboxId,
      address: payload.address,
      providerRef: provisioned?.providerRef || null,
      credentials: provisioned?.credentials || null,
    };
  };
}
