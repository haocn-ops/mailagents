import test from "node:test";
import assert from "node:assert/strict";
import { createInternalResponses } from "../src/internal/responses.js";
import {
  parseInboundEventBody,
  parseInternalPathParam,
  parseMailboxCallbackBody,
} from "../src/internal/validation.js";

test("internal validation parses inbound event body", () => {
  const parsed = parseInboundEventBody({
    address: "Inbox@Example.com",
    sender: "Sender@Example.com",
    sender_domain: "Example.com",
    subject: "Hello",
    provider_message_id: "pm_1",
    raw_ref: "raw_1",
    received_at: "2026-03-09T00:00:00.000Z",
    text_excerpt: "text",
    html_excerpt: "<p>text</p>",
    html_body: "<html></html>",
    headers: { foo: "bar" },
  });

  assert.deepEqual(parsed, {
    ok: true,
    mailboxAddress: "inbox@example.com",
    sender: "sender@example.com",
    senderDomain: "example.com",
    subject: "Hello",
    providerMessageId: "pm_1",
    rawRef: "raw_1",
    receivedAt: "2026-03-09T00:00:00.000Z",
    textExcerpt: "text",
    htmlExcerpt: "<p>text</p>",
    htmlBody: "<html></html>",
    headers: { foo: "bar" },
  });
  assert.equal(parseInboundEventBody({}).ok, false);
});

test("internal validation parses mailbox callback body and path params", () => {
  assert.deepEqual(parseMailboxCallbackBody({ address: "Inbox@Example.com", provider_ref: "prov_1" }), {
    ok: true,
    mailboxAddress: "inbox@example.com",
    providerRef: "prov_1",
  });
  assert.deepEqual(
    parseInternalPathParam("/internal/mailboxes/inbox%40example.com", {
      prefix: "/internal/mailboxes/",
      name: "address",
    }),
    { ok: true, value: "inbox@example.com" },
  );
  assert.equal(parseMailboxCallbackBody({}).ok, false);
});

test("internal responses map common response shapes", () => {
  const responses = createInternalResponses({
    jsonResponse(status, payload, requestId) {
      return { status, payload, requestId };
    },
  });

  assert.deepEqual(responses.accepted("req_1", { status: "accepted" }), {
    status: 202,
    payload: { status: "accepted" },
    requestId: "req_1",
  });
  assert.deepEqual(responses.badRequest("req_2", "address is required"), {
    status: 400,
    payload: { error: "bad_request", message: "address is required" },
    requestId: "req_2",
  });
});
