import test from "node:test";
import assert from "node:assert/strict";
import { createJobQueue } from "../../src/jobs/queue.js";
import { createSendSubmitJob, SEND_SUBMIT_JOB } from "../../src/jobs/send-submit-job.js";
import { createSendService } from "../../src/services/send-service.js";

test("send service queues send and returns delivery info", async () => {
  const store = {
    async getTenantMailbox() {
      return { id: "mailbox-1", address: "a@example.com" };
    },
  };
  const mailBackend = {
    async sendMailboxMessage({ address, to, subject }) {
      assert.equal(address, "a@example.com");
      assert.deepEqual(to, ["b@example.com"]);
      assert.equal(subject, "hello");
      return {
        accepted: ["b@example.com"],
        rejected: [],
        messageId: "msg-1",
        response: "250 ok",
      };
    },
  };
  const queue = createJobQueue({ mode: "inline" });
  queue.register(SEND_SUBMIT_JOB, createSendSubmitJob({ mailBackend }));

  const service = createSendService({ store, queue });
  const result = await service.queueSend({
    tenantId: "tenant-1",
    agentId: "agent-1",
    mailboxId: "mailbox-1",
    recipients: ["b@example.com"],
    subject: "hello",
    text: "body",
    html: "",
    mailboxPassword: "secret",
  });

  assert.equal(result.mailbox.address, "a@example.com");
  assert.equal(result.delivery.messageId, "msg-1");
  assert.equal(result.jobStatus, "completed");
  assert.ok(result.sendAttemptId);
});

test("send service returns null when mailbox is missing", async () => {
  const store = {
    async getTenantMailbox() {
      return null;
    },
  };
  const queue = createJobQueue({ mode: "inline" });
  const service = createSendService({ store, queue });
  const result = await service.queueSend({
    tenantId: "tenant-1",
    agentId: "agent-1",
    mailboxId: "missing",
    recipients: ["b@example.com"],
    subject: "hello",
    text: "body",
    html: "",
    mailboxPassword: "secret",
  });

  assert.equal(result, null);
});
