import test from "node:test";
import assert from "node:assert/strict";
import { createMailuDevApp } from "../src/mailu-dev-app.js";

test("mailu dev app provisions and manages users", async () => {
  const app = createMailuDevApp({ apiToken: "mailu-secret", internalApiToken: "internal-secret" });

  const domainRes = await app(
    new Request("http://mailu-dev.local/api/v1/domain", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer mailu-secret",
      },
      body: JSON.stringify({ name: "inbox.example.com", max_quota_bytes: 1024 }),
    }),
  );
  assert.equal(domainRes.status, 200);

  const createUserRes = await app(
    new Request("http://mailu-dev.local/api/v1/user", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer mailu-secret",
      },
      body: JSON.stringify({
        email: "abc000-1@inbox.example.com",
        enabled: true,
        enable_imap: true,
        quota_bytes: 1024,
      }),
    }),
  );
  assert.equal(createUserRes.status, 200);

  const getUserRes = await app(
    new Request("http://mailu-dev.local/api/v1/user/abc000-1%40inbox.example.com", {
      method: "GET",
      headers: { authorization: "Bearer mailu-secret" },
    }),
  );
  assert.equal(getUserRes.status, 200);
  const user = await getUserRes.json();
  assert.equal(user.email, "abc000-1@inbox.example.com");

  const patchRes = await app(
    new Request("http://mailu-dev.local/api/v1/user/abc000-1%40inbox.example.com", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer mailu-secret",
      },
      body: JSON.stringify({ enabled: false }),
    }),
  );
  assert.equal(patchRes.status, 200);
  const patched = await patchRes.json();
  assert.equal(patched.enabled, false);
});

test("mailu dev app relays inbound events to mailagents internal api", async () => {
  const relayed = [];
  const app = createMailuDevApp({
    apiToken: "mailu-secret",
    internalApiToken: "internal-secret",
    agentsBaseUrl: "http://agents.local",
    fetchImpl: async (url, options) => {
      relayed.push({ url, options });
      return new Response(
        JSON.stringify({
          status: "accepted",
          tenant_id: "tenant-1",
          mailbox_id: "mailbox-1",
          message_id: "message-1",
        }),
        { status: 202, headers: { "content-type": "application/json" } },
      );
    },
  });

  await app(
    new Request("http://mailu-dev.local/api/v1/domain", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer mailu-secret",
      },
      body: JSON.stringify({ name: "inbox.example.com" }),
    }),
  );
  await app(
    new Request("http://mailu-dev.local/api/v1/user", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer mailu-secret",
      },
      body: JSON.stringify({ email: "abc000-1@inbox.example.com", enabled: true }),
    }),
  );

  const inboundRes = await app(
    new Request("http://mailu-dev.local/_dev/inbound", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer mailu-secret",
      },
      body: JSON.stringify({
        address: "abc000-1@inbox.example.com",
        sender: "notify@example.com",
        sender_domain: "example.com",
        subject: "Your verification code",
        text_excerpt: "Use verification code: 654321",
      }),
    }),
  );
  assert.equal(inboundRes.status, 202);
  assert.equal(relayed.length, 1);
  assert.equal(relayed[0].url, "http://agents.local/internal/inbound/events");
  assert.equal(relayed[0].options.headers.authorization, "Bearer internal-secret");
});
