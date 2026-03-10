import test from "node:test";
import assert from "node:assert/strict";
import { createMessageParseJob } from "../../src/jobs/message-parse-job.js";
import { WEBHOOK_DELIVERY_JOB } from "../../src/jobs/webhook-delivery-job.js";

test("message parse job stores parse result and enqueues webhook delivery", async () => {
  const enqueued = [];
  const store = {
    async applyMessageParseResult(payload) {
      assert.equal(payload.messageId, "message-1");
      assert.equal(payload.otpCode, "654321");
    },
    async getMessage(messageId) {
      assert.equal(messageId, "message-1");
      return { messageId };
    },
    async listActiveWebhooksByEvent(tenantId, eventType) {
      assert.equal(tenantId, "tenant-1");
      assert.equal(eventType, "otp.extracted");
      return [{ id: "webhook-1" }];
    },
  };
  const queue = {
    async enqueue(type, payload) {
      enqueued.push({ type, payload });
      return { id: "job-1", status: "completed" };
    },
  };

  const job = createMessageParseJob({ store, queue });
  const result = await job({
    tenantId: "tenant-1",
    mailboxId: "mailbox-1",
    messageId: "message-1",
    sender: "notify@example.com",
    senderDomain: "example.com",
    subject: "Your code is 654321",
    receivedAt: "2026-03-09T00:00:00.000Z",
    textExcerpt: "Click https://example.com/verify?token=abc",
    htmlExcerpt: "",
    htmlBody: "",
    requestId: "req-1",
  });

  assert.equal(result.messageId, "message-1");
  assert.equal(result.eventType, "otp.extracted");
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].type, WEBHOOK_DELIVERY_JOB);
  assert.equal(enqueued[0].payload.webhookId, "webhook-1");
  assert.equal(enqueued[0].payload.eventPayload.otp_code, "654321");
});

test("message parse job skips webhook enqueue when message is missing", async () => {
  let queriedWebhooks = false;
  let enqueued = false;
  const store = {
    async applyMessageParseResult(payload) {
      assert.equal(payload.messageId, "message-missing");
    },
    async getMessage(messageId) {
      assert.equal(messageId, "message-missing");
      return null;
    },
    async listActiveWebhooksByEvent() {
      queriedWebhooks = true;
      return [];
    },
  };
  const queue = {
    async enqueue() {
      enqueued = true;
      return { id: "job-x", status: "queued" };
    },
  };

  const job = createMessageParseJob({ store, queue });
  const result = await job({
    tenantId: "tenant-1",
    mailboxId: "mailbox-1",
    messageId: "message-missing",
    sender: "notify@example.com",
    senderDomain: "example.com",
    subject: "No OTP present",
    receivedAt: "2026-03-10T00:00:00.000Z",
    textExcerpt: "hello world",
    htmlExcerpt: "",
    htmlBody: "",
    requestId: "req-missing",
  });

  assert.equal(result.skipped, true);
  assert.equal(result.reason, "message_not_found");
  assert.equal(result.deliveryJobs.length, 0);
  assert.equal(queriedWebhooks, false);
  assert.equal(enqueued, false);
});

test("message parse job can run against injected repository seam", async () => {
  const enqueued = [];
  const repository = {
    async applyMessageParseResult(payload) {
      assert.equal(payload.messageId, "message-seam");
    },
    async getMessage(messageId) {
      assert.equal(messageId, "message-seam");
      return { messageId };
    },
    async listActiveWebhooksByEvent(tenantId, eventType) {
      assert.equal(tenantId, "tenant-seam");
      assert.equal(eventType, "otp.extracted");
      return [{ id: "webhook-seam" }];
    },
  };
  const queue = {
    async enqueue(type, payload) {
      enqueued.push({ type, payload });
      return { id: "job-seam", status: "queued" };
    },
  };

  const job = createMessageParseJob({ queue, repository });
  const result = await job({
    tenantId: "tenant-seam",
    mailboxId: "mailbox-seam",
    messageId: "message-seam",
    sender: "notify@example.com",
    senderDomain: "example.com",
    subject: "Code 987654",
    receivedAt: "2026-03-10T00:00:00.000Z",
    textExcerpt: "verify here",
    htmlExcerpt: "",
    htmlBody: "",
    requestId: "req-seam",
  });

  assert.equal(result.messageId, "message-seam");
  assert.equal(result.eventType, "otp.extracted");
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].payload.webhookId, "webhook-seam");
});
