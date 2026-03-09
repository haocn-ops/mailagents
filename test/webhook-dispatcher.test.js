import test from "node:test";
import assert from "node:assert/strict";
import { createWebhookDispatcher } from "../src/webhook-dispatcher.js";
import { encryptSecret, signHmacSha256 } from "../src/utils.js";

test("webhook dispatcher signs payloads and retries failures", async () => {
  const attempts = [];
  const payload = { event_type: "otp.extracted", otp_code: "123456" };
  const secret = "super-secret";
  const dispatcher = createWebhookDispatcher({
    secretEncryptionKey: "enc-key",
    timeoutMs: 1000,
    retryAttempts: 3,
    retryBackoffMs: 1,
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    attempts.push({ url, options });
    if (attempts.length < 3) {
      return new Response("fail", { status: 500 });
    }
    return new Response("ok", { status: 200 });
  };

  try {
    const result = await dispatcher.dispatch({
      webhook: {
        targetUrl: "https://example.com/hook",
        secretEnc: encryptSecret(secret, "enc-key"),
      },
      payload,
    });

    assert.equal(result.ok, true);
    assert.equal(result.attempts, 3);
    assert.equal(attempts.length, 3);

    const finalHeaders = attempts[2].options.headers;
    const timestamp = finalHeaders["x-agent-mail-timestamp"];
    assert.ok(finalHeaders["x-agent-mail-delivery-id"]);
    assert.equal(finalHeaders["x-agent-mail-attempt"], "3");
    assert.equal(
      finalHeaders["x-agent-mail-signature"],
      `t=${timestamp},v1=${signHmacSha256(secret, `${timestamp}.${JSON.stringify(payload)}`)}`,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("webhook dispatcher returns failure context after retries are exhausted", async () => {
  const dispatcher = createWebhookDispatcher({
    timeoutMs: 1000,
    retryAttempts: 2,
    retryBackoffMs: 1,
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("upstream down", { status: 503 });

  try {
    const result = await dispatcher.dispatch({
      webhook: {
        targetUrl: "https://example.com/hook",
      },
      payload: { event_type: "mail.received" },
    });

    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 503);
    assert.equal(result.attempts, 2);
    assert.equal(result.errorMessage, "Webhook returned HTTP 503");
    assert.equal(result.responseExcerpt, "upstream down");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
