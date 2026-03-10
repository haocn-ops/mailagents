import test from "node:test";
import assert from "node:assert/strict";
import { createInternalService } from "../../src/services/internal-service.js";

test("internal service does not enqueue parse job when inbound message is deduped", async () => {
  let enqueueCalled = false;
  const store = {
    async findMailboxByAddress(address) {
      assert.equal(address, "a@example.com");
      return {
        id: "mailbox-1",
        tenantId: "tenant-1",
        address: "a@example.com",
      };
    },
    async ingestInboundMessage() {
      return {
        tenantId: "tenant-1",
        mailboxId: "mailbox-1",
        messageId: "message-1",
        deduped: true,
      };
    },
  };
  const queue = {
    async enqueue() {
      enqueueCalled = true;
      return { id: "job-1", status: "queued" };
    },
  };
  const service = createInternalService({ store, queue });

  const result = await service.ingestInboundEvent({
    mailboxAddress: "a@example.com",
    sender: "notify@example.com",
    senderDomain: "example.com",
    subject: "duplicate",
    providerMessageId: "provider-1",
    rawRef: "mailu://raw/1",
    receivedAt: new Date().toISOString(),
    textExcerpt: "code 123456",
    htmlExcerpt: null,
    htmlBody: null,
    headers: {},
    requestId: "req-1",
  });

  assert.equal(result.status, "accepted");
  assert.equal(result.deduped, true);
  assert.equal(result.message_id, "message-1");
  assert.equal(result.parse_job, null);
  assert.equal(enqueueCalled, false);
});

test("internal service can run against injected repository seam", async () => {
  const calls = [];
  const repository = {
    async findMailboxByAddress(address) {
      calls.push(["findMailboxByAddress", address]);
      return {
        id: "mailbox-2",
        tenantId: "tenant-2",
        address: "b@example.com",
      };
    },
    async ingestInboundMessage(payload) {
      calls.push(["ingestInboundMessage", payload.mailboxId, payload.providerMessageId]);
      return {
        tenantId: "tenant-2",
        mailboxId: "mailbox-2",
        messageId: "message-2",
        deduped: false,
      };
    },
  };
  const queue = {
    async enqueue(type, payload) {
      calls.push(["enqueue", type, payload.messageId]);
      return { id: "job-2", status: "queued" };
    },
  };

  const service = createInternalService({ queue, repository });
  const result = await service.ingestInboundEvent({
    mailboxAddress: "b@example.com",
    sender: "notify@example.com",
    senderDomain: "example.com",
    subject: "new inbound",
    providerMessageId: "provider-2",
    rawRef: "mailu://raw/2",
    receivedAt: new Date().toISOString(),
    textExcerpt: "code 654321",
    htmlExcerpt: null,
    htmlBody: null,
    headers: {},
    requestId: "req-2",
  });

  assert.equal(result.status, "accepted");
  assert.equal(result.message_id, "message-2");
  assert.equal(result.parse_job?.job_id, "job-2");
  assert.equal(result.parse_job?.status, "queued");
  assert.deepEqual(calls, [
    ["findMailboxByAddress", "b@example.com"],
    ["ingestInboundMessage", "mailbox-2", "provider-2"],
    ["enqueue", "message.parse", "message-2"],
  ]);
});
