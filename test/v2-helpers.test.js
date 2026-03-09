import test from "node:test";
import assert from "node:assert/strict";
import {
  parseLeaseCreateBody,
  parseMessageListQuery,
  parseSendMessageBody,
  parseWebhookCreateBody,
} from "../src/v2/validation.js";
import { createV2Responses } from "../src/v2/responses.js";

test("v2 validation parses lease create body", () => {
  assert.deepEqual(
    parseLeaseCreateBody(
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
  assert.equal(parseLeaseCreateBody({}, "agent_1").ok, false);
  assert.equal(parseLeaseCreateBody({ agent_id: "agent_2", purpose: "x", ttl_hours: 1 }, "agent_1").status, 403);
});

test("v2 validation parses message list query", () => {
  const url = new URL("https://example.test/v2/messages?mailbox_id=mbx_1&since=123&limit=10");
  assert.deepEqual(parseMessageListQuery(url), {
    ok: true,
    mailboxId: "mbx_1",
    since: "123",
    limit: 10,
  });
  assert.equal(parseMessageListQuery(new URL("https://example.test/v2/messages")).ok, false);
});

test("v2 validation parses send and webhook create bodies", () => {
  assert.equal(
    parseSendMessageBody({
      mailbox_id: "mbx_1",
      to: ["a@example.com"],
      subject: "hello",
      text: "body",
      mailbox_password: "secret",
    }).ok,
    true,
  );
  assert.equal(
    parseWebhookCreateBody({
      event_types: ["mail.received"],
      target_url: "https://example.test/hook",
      secret: "1234567890123456",
    }).ok,
    true,
  );
  assert.equal(parseWebhookCreateBody({}).ok, false);
});

test("v2 responses map common response shapes", async () => {
  const calls = [];
  const responses = createV2Responses({
    jsonResponse(status, payload, requestId) {
      calls.push({ status, payload, requestId });
      return { status, payload, requestId };
    },
  });

  assert.deepEqual(responses.okItems("req_1", [{ id: "x" }]), {
    status: 200,
    payload: { items: [{ id: "x" }] },
    requestId: "req_1",
  });
  assert.deepEqual(responses.mailBackendError("req_2", "boom", { send_attempt_id: "snd_1" }), {
    status: 502,
    payload: {
      error: "mail_backend_error",
      message: "boom",
      send_attempt_id: "snd_1",
    },
    requestId: "req_2",
  });
  assert.equal(calls.length, 2);
});
