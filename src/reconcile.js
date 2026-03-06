async function repairFinding({ mailbox, backend, expectedEnabled, store, mailBackend }) {
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

export async function reconcileMailboxes({ store, mailBackend, repair = false }) {
  const mailboxes = await store.listMailboxesForReconcile();
  const findings = [];
  let repaired = 0;

  for (const mailbox of mailboxes) {
    const backend = await mailBackend.getMailbox(mailbox.address);
    const expectedEnabled = mailbox.status === "leased";

    if (!backend.found) {
      const finding = {
        severity: mailbox.status === "available" ? "medium" : "high",
        code: "backend_missing",
        mailbox_id: mailbox.mailboxId,
        tenant_id: mailbox.tenantId,
        address: mailbox.address,
        control_status: mailbox.status,
        backend_status: backend.backendStatus,
      };
      if (repair && expectedEnabled) {
        Object.assign(finding, await repairFinding({ mailbox, backend, expectedEnabled, store, mailBackend }));
        repaired += finding.repaired ? 1 : 0;
      }
      findings.push(finding);
      continue;
    }

    if (Boolean(backend.enabled) !== expectedEnabled) {
      const finding = {
        severity: "high",
        code: "status_mismatch",
        mailbox_id: mailbox.mailboxId,
        tenant_id: mailbox.tenantId,
        address: mailbox.address,
        control_status: mailbox.status,
        backend_status: backend.backendStatus,
        expected_enabled: expectedEnabled,
        actual_enabled: Boolean(backend.enabled),
      };
      if (repair) {
        Object.assign(finding, await repairFinding({ mailbox, backend, expectedEnabled, store, mailBackend }));
        repaired += finding.repaired ? 1 : 0;
      }
      findings.push(finding);
    }
  }

  return {
    scanned: mailboxes.length,
    repair_mode: repair,
    repaired,
    findings,
  };
}
