export async function repairMailboxFinding({ mailbox, expectedEnabled, store, mailBackend }) {
  if (!expectedEnabled) {
    await mailBackend.releaseMailbox({
      tenantId: mailbox.tenantId,
      mailboxId: mailbox.mailboxId,
      address: mailbox.address,
      providerRef: mailbox.providerRef,
    });
    await store.recordMailboxBackendEvent({
      tenantId: mailbox.tenantId,
      mailboxId: mailbox.mailboxId,
      action: "mailbox.reconcile_released",
      metadata: { address: mailbox.address },
    });
    return {
      repaired: true,
      repair_action: "release_backend_mailbox",
    };
  }

  const provisioned = await mailBackend.provisionMailbox({
    tenantId: mailbox.tenantId,
    mailboxId: mailbox.mailboxId,
    address: mailbox.address,
    ttlHours: mailbox.leaseExpiresAt ? 1 : undefined,
  });
  if (provisioned?.providerRef) {
    await store.saveMailboxProviderRef(mailbox.mailboxId, provisioned.providerRef);
  }
  await store.recordMailboxBackendEvent({
    tenantId: mailbox.tenantId,
    mailboxId: mailbox.mailboxId,
    action: "mailbox.reconcile_provisioned",
    metadata: { address: mailbox.address, provider_ref: provisioned?.providerRef || null },
  });
  return {
    repaired: true,
    repair_action: "provision_backend_mailbox",
    provider_ref: provisioned?.providerRef || null,
  };
}
