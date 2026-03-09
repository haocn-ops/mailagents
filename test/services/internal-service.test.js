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
