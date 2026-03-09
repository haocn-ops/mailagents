import test from "node:test";
import assert from "node:assert/strict";
import { createV1Metering } from "../src/v1/metering.js";
import {
  parseMailboxAllocateBody,
  parseInvoiceId,
  parseLatestMessagesQuery,
  parseMailboxActionBody,
  parseMessageId,
  parseSendMessageBody,
  parseWebhookBody,
} from "../src/v1/validation.js";

test("v1 validation parses mailbox action body", () => {
  assert.deepEqual(parseMailboxActionBody({ mailbox_id: "mbx_1" }), {
    ok: true,
    mailboxId: "mbx_1",
  });
  assert.equal(parseMailboxActionBody({}).ok, false);
});

test("v1 validation parses mailbox allocation body", () => {
  assert.deepEqual(
    parseMailboxAllocateBody(
      {
        agent_id: "agent_1",
        purpose: "signup",
        ttl_hours: "24",
      },
      "agent_1",
    ),
    {
      ok: true,
      agentId: "agent_1",
      purpose: "signup",
      ttlHours: 24,
    },
  );
  assert.equal(parseMailboxAllocateBody({}, "agent_1").ok, false);
  assert.equal(parseMailboxAllocateBody({ agent_id: "agent_2", purpose: "x", ttl_hours: 1 }, "agent_1").status, 403);
});

test("v1 validation parses latest messages query", () => {
  const url = new URL("https://example.test/v1/messages/latest?mailbox_id=mbx_1&since=123&limit=10");
  assert.deepEqual(parseLatestMessagesQuery(url), {
    ok: true,
    mailboxId: "mbx_1",
    since: "123",
    limit: 10,
  });
  assert.equal(parseLatestMessagesQuery(new URL("https://example.test/v1/messages/latest")).ok, false);
});

test("v1 validation parses send body and webhook body", () => {
  assert.equal(
    parseSendMessageBody({
      mailbox_id: "mbx_1",
      to: ["a@example.com", "b@example.com"],
      subject: "hello",
      text: "body",
      mailbox_password: "secret",
    }).ok,
    true,
  );
  assert.equal(
    parseWebhookBody({
      event_types: ["mail.received"],
      target_url: "https://example.test/hook",
      secret: "1234567890123456",
    }).ok,
    true,
  );
  assert.equal(parseWebhookBody({}).ok, false);
});

test("v1 validation parses path ids", () => {
  assert.deepEqual(parseInvoiceId("/v1/billing/invoices/inv_1"), { ok: true, invoiceId: "inv_1" });
  assert.deepEqual(parseMessageId("/v1/messages/msg_1"), { ok: true, messageId: "msg_1" });
  assert.equal(parseInvoiceId("/v1/billing/invoices/").ok, false);
  assert.equal(parseMessageId("/v1/messages/").ok, false);
});

test("v1 metering records usage and optional overage charge", async () => {
  const calls = [];
  const store = {
    async recordUsage(payload) {
      calls.push({ type: "usage", payload });
    },
    async recordOverageCharge(payload) {
      calls.push({ type: "charge", payload });
    },
  };
  const metering = createV1Metering({
    store,
    getOverageChargeUsdc() {
      return 0.25;
    },
  });

  const auth = {
    payload: {
      tenant_id: "tenant_1",
      agent_id: "agent_1",
    },
  };

  await metering.recordUsage({
    auth,
    endpoint: "POST /v1/messages/send",
    requestId: "req_1",
    access: { requiresCharge: true, reasons: [{ code: "tenant_qps" }] },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].type, "usage");
  assert.equal(calls[1].type, "charge");
  assert.equal(calls[1].payload.amountUsdc, 0.25);
});
