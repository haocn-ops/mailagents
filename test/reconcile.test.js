import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../src/storage/memory-store.js";
import { reconcileMailboxes } from "../src/reconcile.js";

async function seedLeasedMailbox(store, wallet) {
  const identity = await store.getOrCreateIdentity(wallet);
  const allocation = await store.allocateMailbox({
    tenantId: identity.tenantId,
    agentId: identity.agentId,
    purpose: "reconcile",
    ttlHours: 1,
  });
  return { identity, allocation };
}

test("reconcile detects missing backend mailbox for leased mailbox", async () => {
  const store = new MemoryStore({
    chainId: 84532,
    challengeTtlMs: 1000,
    mailboxDomain: "inbox.example.com",
  });
  const { allocation } = await seedLeasedMailbox(store, "0xabc0000000000000000000000000000000001111");

  const mailBackend = {
    async getMailbox(address) {
      return {
        found: false,
        address,
        enabled: false,
        backendStatus: "missing",
      };
    },
  };

  const result = await reconcileMailboxes({ store, mailBackend });
  assert.equal(result.scanned, 5);
  assert.ok(result.findings.some((item) => item.mailbox_id === allocation.mailbox.id && item.code === "backend_missing"));
});

test("reconcile detects status mismatch between control plane and backend", async () => {
  const store = new MemoryStore({
    chainId: 84532,
    challengeTtlMs: 1000,
    mailboxDomain: "inbox.example.com",
  });
  const { allocation } = await seedLeasedMailbox(store, "0xabc0000000000000000000000000000000002222");

  const mailBackend = {
    async getMailbox(address) {
      return {
        found: true,
        address,
        enabled: false,
        backendStatus: "disabled",
      };
    },
  };

  const result = await reconcileMailboxes({ store, mailBackend });
  assert.ok(result.findings.some((item) => item.mailbox_id === allocation.mailbox.id && item.code === "status_mismatch"));
});

test("reconcile repair reprovisions leased mailbox when backend is missing", async () => {
  const store = new MemoryStore({
    chainId: 84532,
    challengeTtlMs: 1000,
    mailboxDomain: "inbox.example.com",
  });
  const { allocation } = await seedLeasedMailbox(store, "0xabc0000000000000000000000000000000003333");
  const calls = [];

  const mailBackend = {
    async getMailbox(address) {
      return {
        found: false,
        address,
        enabled: false,
        backendStatus: "missing",
      };
    },
    async provisionMailbox(payload) {
      calls.push(["provision", payload.address]);
      return { providerRef: `mailu:${payload.address}` };
    },
    async releaseMailbox() {
      throw new Error("unexpected release");
    },
  };

  const result = await reconcileMailboxes({ store, mailBackend, repair: true });
  assert.equal(result.repair_mode, true);
  assert.equal(result.repaired, 1);
  assert.deepEqual(calls, [["provision", allocation.mailbox.address]]);
  assert.equal(result.findings.find((item) => item.mailbox_id === allocation.mailbox.id).repair_action, "provision_backend_mailbox");
});

test("reconcile repair disables backend mailbox when control plane says available", async () => {
  const store = new MemoryStore({
    chainId: 84532,
    challengeTtlMs: 1000,
    mailboxDomain: "inbox.example.com",
  });
  const identity = await store.getOrCreateIdentity("0xabc0000000000000000000000000000000004444");
  const mailbox = (await store.listMailboxesForReconcile())[0];
  const calls = [];

  const mailBackend = {
    async getMailbox(address) {
      return {
        found: true,
        address,
        enabled: true,
        backendStatus: "enabled",
      };
    },
    async provisionMailbox() {
      throw new Error("unexpected provision");
    },
    async releaseMailbox(payload) {
      calls.push(["release", payload.address]);
      return { status: "disabled" };
    },
  };

  const result = await reconcileMailboxes({ store, mailBackend, repair: true });
  assert.equal(identity.tenantId, mailbox.tenantId);
  assert.equal(result.repaired, 5);
  assert.ok(calls.some((entry) => entry[1] === mailbox.address));
  assert.ok(result.findings.some((item) => item.mailbox_id === mailbox.mailboxId && item.repair_action === "release_backend_mailbox"));
});
