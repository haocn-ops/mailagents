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

test("memory store persists webhook deliveries in first-class V2 state", async () => {
  const store = new MemoryStore({
    chainId: 84532,
    challengeTtlMs: 300000,
    mailboxDomain: "inbox.example.com",
  });
  const { identity } = await seedMailboxLease(store);

  const webhook = await store.createWebhook({
    tenantId: identity.tenantId,
    eventTypes: ["otp.extracted"],
    targetUrl: "https://example.com/hook",
    secret: "1234567890abcdef",
  });

  await store.recordWebhookDelivery(webhook.id, {
    statusCode: 503,
    requestId: "req-1",
    metadata: {
      event_type: "otp.extracted",
      resource_id: "message-1",
      attempts: 3,
      ok: false,
      error_message: "Webhook returned HTTP 503",
      response_excerpt: "upstream down",
    },
  });

  const deliveries = store.getStateForTests().webhookDeliveries;
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].webhookId, webhook.id);
  assert.equal(deliveries[0].resourceId, "message-1");
  assert.equal(deliveries[0].deliveryStatus, "failed");
  assert.equal(deliveries[0].errorMessage, "Webhook returned HTTP 503");

  const listed = await store.listTenantWebhookDeliveries(identity.tenantId, { webhookId: webhook.id });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].webhook_id, webhook.id);
  assert.equal(listed[0].status_code, 503);
  assert.equal(listed[0].attempts, 3);
  assert.equal(listed[0].ok, false);
  assert.equal(listed[0].error_message, "Webhook returned HTTP 503");
  assert.equal(listed[0].request_id, "req-1");
});

test("memory store exposes admin webhook deliveries with tenant and webhook filters", async () => {
  const store = new MemoryStore({
    chainId: 84532,
    challengeTtlMs: 300000,
    mailboxDomain: "inbox.example.com",
  });
  const { identity } = await seedMailboxLease(store);

  const webhook = await store.createWebhook({
    tenantId: identity.tenantId,
    eventTypes: ["otp.extracted"],
    targetUrl: "https://example.com/admin-hook",
    secret: "1234567890abcdef",
  });

  await store.recordWebhookDelivery(webhook.id, {
    statusCode: 200,
    requestId: "req-admin-1",
    metadata: {
      attempts: 1,
      ok: true,
    },
  });

  const listed = await store.adminListWebhookDeliveries({
    page: 1,
    pageSize: 20,
    tenantId: identity.tenantId,
    webhookId: webhook.id,
  });

  assert.equal(listed.page, 1);
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0].tenant_id, identity.tenantId);
  assert.equal(listed.items[0].webhook_id, webhook.id);
  assert.equal(listed.items[0].request_id, "req-admin-1");
});

test("memory store exposes admin send attempts with filters", async () => {
  const store = new MemoryStore({
    chainId: 84532,
    challengeTtlMs: 300000,
    mailboxDomain: "inbox.example.com",
  });
  const { identity, mailbox } = await seedMailboxLease(store);

  const attempt = await store.createSendAttempt({
    tenantId: identity.tenantId,
    agentId: identity.agentId,
    mailboxId: mailbox.mailbox_id,
    to: ["dest@example.com"],
    subject: "admin send list",
  });
  await store.completeSendAttempt(attempt.send_attempt_id, {
    accepted: ["dest@example.com"],
    rejected: [],
    messageId: "msg-admin-1",
    response: "250 ok",
  });

  const listed = await store.adminListSendAttempts({
    page: 1,
    pageSize: 20,
    tenantId: identity.tenantId,
    mailboxId: mailbox.mailbox_id,
    submissionStatus: "accepted",
  });

  assert.equal(listed.page, 1);
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0].tenant_id, identity.tenantId);
  assert.equal(listed.items[0].mailbox_id, mailbox.mailbox_id);
  assert.equal(listed.items[0].submission_status, "accepted");
});
