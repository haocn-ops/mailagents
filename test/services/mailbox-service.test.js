import test from "node:test";
import assert from "node:assert/strict";
import { createMailboxProvisionJob, MAILBOX_PROVISION_JOB } from "../../src/jobs/mailbox-provision-job.js";
import { createJobQueue } from "../../src/jobs/queue.js";
import { createMailboxService } from "../../src/services/mailbox-service.js";

test("mailbox service allocates and provisions via queue", async () => {
  const accounts = [];
  const leases = [];
  const store = {
    async allocateMailbox() {
      return {
        mailbox: { id: "mailbox-1", address: "a@example.com" },
        lease: { id: "lease-1", expiresAt: "2026-03-09T00:00:00.000Z" },
      };
    },
    async releaseMailbox() {
      throw new Error("release should not be called");
    },
    async saveMailboxProviderRef(mailboxId, providerRef) {
      assert.equal(mailboxId, "mailbox-1");
      assert.equal(providerRef, "provider-ref");
    },
    async upsertMailboxAccountFromLegacyMailbox(mailbox) {
      accounts.push(mailbox);
      return { id: "account-1" };
    },
    async createMailboxLeaseV2(lease) {
      leases.push(lease);
      return { id: "lease-v2-1" };
    },
    async markMailboxAccountProvisioned({ mailboxAccountId }) {
      assert.equal(mailboxAccountId, "account-1");
    },
    async markMailboxLeaseV2Active(leaseId) {
      assert.equal(leaseId, "lease-v2-1");
    },
  };
  const mailBackend = {
    async provisionMailbox({ address }) {
      assert.equal(address, "a@example.com");
      return {
        providerRef: "provider-ref",
        credentials: {
          login: "a@example.com",
          password: "secret",
          webmailUrl: "https://mail.example.com",
        },
      };
    },
  };
  const queue = createJobQueue({ mode: "inline" });
  queue.register(MAILBOX_PROVISION_JOB, createMailboxProvisionJob({ store, mailBackend }));

  const service = createMailboxService({ store, queue });
  const result = await service.requestLease({
    tenantId: "tenant-1",
    agentId: "agent-1",
    purpose: "signup",
    ttlHours: 1,
  });

  assert.equal(result.mailbox.id, "mailbox-1");
  assert.equal(result.provider.credentials.login, "a@example.com");
  assert.equal(result.jobStatus, "completed");
  assert.equal(accounts.length, 1);
  assert.equal(leases.length, 1);
  assert.equal(result.mailboxAccount.id, "account-1");
  assert.equal(result.leaseV2.id, "lease-v2-1");
});

test("mailbox service releases allocation if provisioning fails", async () => {
  let released = false;
  const store = {
    async allocateMailbox() {
      return {
        mailbox: { id: "mailbox-1", address: "a@example.com" },
        lease: { id: "lease-1", expiresAt: "2026-03-09T00:00:00.000Z" },
      };
    },
    async releaseMailbox({ mailboxId }) {
      released = mailboxId === "mailbox-1";
      return true;
    },
  };
  const queue = createJobQueue({ mode: "inline" });
  queue.register(MAILBOX_PROVISION_JOB, async () => {
    throw new Error("backend failed");
  });

  const service = createMailboxService({ store, queue });
  await assert.rejects(
    service.requestLease({
      tenantId: "tenant-1",
      agentId: "agent-1",
      purpose: "signup",
      ttlHours: 1,
    }),
    /backend failed/,
  );
  assert.equal(released, true);
});
