import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../../src/storage/memory-store.js";

async function seedMailboxLease(store) {
  const identity = await store.getOrCreateIdentity("0xabc0000000000000000000000000000000000123");
  const allocated = await store.allocateMailbox({
    tenantId: identity.tenantId,
    agentId: identity.agentId,
    purpose: "test",
    ttlHours: 1,
  });
  return {
    identity,
    mailbox: allocated.mailbox,
    lease: allocated.lease,
  };
}

test("memory store mirrors inbound messages into V2 raw and message tables", async () => {
  const store = new MemoryStore({
    chainId: 84532,
    challengeTtlMs: 300000,
    mailboxDomain: "inbox.example.com",
  });
  const { identity, mailbox } = await seedMailboxLease(store);

  const ingested = await store.ingestInboundMessage({
    tenantId: identity.tenantId,
    mailboxId: mailbox.id,
    providerMessageId: "provider-1",
    sender: "notify@example.com",
    senderDomain: "example.com",
    subject: "Inbound",
    rawRef: "mailu://raw/1",
    receivedAt: new Date().toISOString(),
    payload: {
      headers: { "message-id": "<abc@example.com>" },
    },
  });

  const messageV2 = store.getStateForTests().messagesV2.get(ingested.messageId);
  assert.ok(messageV2);
  assert.equal(messageV2.messageStatus, "received");

  const rawMessage = store.getStateForTests().rawMessagesV2.get(messageV2.rawMessageId);
  assert.ok(rawMessage);
  assert.equal(rawMessage.backendMessageId, "provider-1");
  assert.equal(rawMessage.rawRef, "mailu://raw/1");
});

test("memory store mirrors parse results into V2 parse tables", async () => {
  const store = new MemoryStore({
    chainId: 84532,
    challengeTtlMs: 300000,
    mailboxDomain: "inbox.example.com",
  });
  const { identity, mailbox } = await seedMailboxLease(store);

  const ingested = await store.ingestInboundMessage({
    tenantId: identity.tenantId,
    mailboxId: mailbox.id,
    providerMessageId: "provider-2",
    sender: "notify@example.com",
    senderDomain: "example.com",
    subject: "Parse me",
    rawRef: "mailu://raw/2",
    receivedAt: new Date().toISOString(),
    payload: {},
  });

  await store.applyMessageParseResult({
    messageId: ingested.messageId,
    otpCode: "123456",
    verificationLink: "https://example.com/verify",
    payload: {
      parser: "builtin",
    },
  });

  const messageV2 = store.getStateForTests().messagesV2.get(ingested.messageId);
  assert.equal(messageV2.messageStatus, "parsed");
  const parseResults = store.getStateForTests().messageParseResultsV2.get(ingested.messageId) || [];
  assert.equal(parseResults.length, 1);
  assert.equal(parseResults[0].otpCode, "123456");
  assert.equal(parseResults[0].parseStatus, "parsed");
});
