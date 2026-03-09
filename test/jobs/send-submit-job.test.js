import test from "node:test";
import assert from "node:assert/strict";
import { createSendSubmitJob } from "../../src/jobs/send-submit-job.js";

test("send submit job delegates to mail backend", async () => {
  const mailBackend = {
    async sendMailboxMessage({ address, to, subject, text }) {
      assert.equal(address, "agent@example.com");
      assert.deepEqual(to, ["to@example.com"]);
      assert.equal(subject, "subject");
      assert.equal(text, "hello");
      return {
        accepted: ["to@example.com"],
        rejected: [],
        messageId: "message-1",
      };
    },
  };

  const job = createSendSubmitJob({ mailBackend });
  const result = await job({
    sendAttemptId: "attempt-1",
    tenantId: "tenant-1",
    agentId: "agent-1",
    mailboxId: "mailbox-1",
    address: "agent@example.com",
    recipients: ["to@example.com"],
    subject: "subject",
    text: "hello",
    html: "",
    mailboxPassword: "secret",
  });

  assert.equal(result.sendAttemptId, "attempt-1");
  assert.equal(result.delivery.messageId, "message-1");
});
