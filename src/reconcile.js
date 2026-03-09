import { repairMailboxFinding } from "./reconcile-helpers.js";

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
        Object.assign(finding, await repairMailboxFinding({ mailbox, expectedEnabled, store, mailBackend }));
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
        Object.assign(finding, await repairMailboxFinding({ mailbox, expectedEnabled, store, mailBackend }));
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
