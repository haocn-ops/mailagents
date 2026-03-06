import test from "node:test";
import assert from "node:assert/strict";
import { createFetchApp } from "../src/fetch-app.js";
import { MemoryStore } from "../src/storage/memory-store.js";
import { createConfig } from "../src/config.js";

function makeApp() {
  const cfg = createConfig({
    JWT_SECRET: "test-secret",
    INTERNAL_API_TOKEN: "internal-secret",
    BASE_CHAIN_ID: "84532",
    MAILBOX_DOMAIN: "inbox.example.com",
    SIWE_MODE: "mock",
    PAYMENT_MODE: "mock",
  });
  const store = new MemoryStore({
    chainId: cfg.baseChainId,
    challengeTtlMs: cfg.siweChallengeTtlMs,
    mailboxDomain: cfg.mailboxDomain,
  });
  return createFetchApp({ config: cfg, store });
}

async function issueToken(app, wallet = "0xabc0000000000000000000000000000000000123") {
  const challengeRes = await app(
    new Request("http://localhost/v1/auth/siwe/challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet_address: wallet }),
    }),
  );
  const challenge = await challengeRes.json();

  const verifyRes = await app(
    new Request("http://localhost/v1/auth/siwe/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: challenge.message, signature: "0xsignature" }),
    }),
  );
  return verifyRes.json();
}

test("fetch app health endpoint", async () => {
  const app = makeApp();
  const res = await app(new Request("http://localhost/healthz", { method: "GET" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "ok");
});

test("fetch app auth challenge + verify", async () => {
  const app = makeApp();
  const verify = await issueToken(app);
  assert.ok(verify.access_token);
});

test("fetch app serves admin dashboard html", async () => {
  const app = makeApp();
  const res = await app(new Request("http://localhost/admin", { method: "GET" }));
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Admin Dashboard/);
  assert.match(html, /Live API/);
});

test("fetch app serves user app html", async () => {
  const app = makeApp();
  const res = await app(new Request("http://localhost/app", { method: "GET" }));
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /User Workspace/);
  assert.match(html, /Allocate Mailbox/);
  assert.match(html, /Latest Messages/);
  assert.match(html, /Open Webmail/);
});

test("fetch app exposes tenant mailbox and webhook lists", async () => {
  const app = makeApp();
  const verify = await issueToken(app, "0xabc0000000000000000000000000000000000999");

  const allocateRes = await app(
    new Request("http://localhost/v1/mailboxes/allocate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "user-app", ttl_hours: 1 }),
    }),
  );
  assert.equal(allocateRes.status, 200);
  const allocated = await allocateRes.json();
  assert.equal(allocated.webmail_login, allocated.address);
  assert.equal(allocated.webmail_password, "noop-password");

  const webhookRes = await app(
    new Request("http://localhost/v1/webhooks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
      body: JSON.stringify({
        event_types: ["otp.extracted"],
        target_url: "https://example.com/user-app-webhook",
        secret: "1234567890abcdef",
      }),
    }),
  );
  assert.equal(webhookRes.status, 200);

  const mailboxesRes = await app(
    new Request("http://localhost/v1/mailboxes", {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  assert.equal(mailboxesRes.status, 200);
  const mailboxes = await mailboxesRes.json();
  assert.ok(mailboxes.items.length >= 1);
  assert.ok(mailboxes.items.some((item) => item.status === "leased"));

  const webhooksRes = await app(
    new Request("http://localhost/v1/webhooks", {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  assert.equal(webhooksRes.status, 200);
  const webhooks = await webhooksRes.json();
  assert.equal(webhooks.items.length, 1);
  assert.equal(webhooks.items[0].target_url, "https://example.com/user-app-webhook");
});

test("fetch app issues webmail credentials for an existing tenant mailbox", async () => {
  const app = makeApp();
  const verify = await issueToken(app, "0xabc0000000000000000000000000000000000777");

  const allocateRes = await app(
    new Request("http://localhost/v1/mailboxes/allocate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "webmail", ttl_hours: 1 }),
    }),
  );
  const allocation = await allocateRes.json();

  const issueRes = await app(
    new Request("http://localhost/v1/mailboxes/credentials/reset", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
      },
      body: JSON.stringify({ mailbox_id: allocation.mailbox_id }),
    }),
  );
  assert.equal(issueRes.status, 200);
  const issued = await issueRes.json();
  assert.equal(issued.mailbox_id, allocation.mailbox_id);
  assert.equal(issued.webmail_login, allocation.address);
  assert.equal(issued.webmail_password, "noop-password");
});

test("fetch app exposes tenant message detail and invoice list", async () => {
  const app = makeApp();
  const verify = await issueToken(app, "0xabc0000000000000000000000000000000000888");

  const allocateRes = await app(
    new Request("http://localhost/v1/mailboxes/allocate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "detail-test", ttl_hours: 1 }),
    }),
  );
  assert.equal(allocateRes.status, 200);
  const allocation = await allocateRes.json();

  const messagesRes = await app(
    new Request(`http://localhost/v1/messages/latest?mailbox_id=${allocation.mailbox_id}&limit=10`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
    }),
  );
  assert.equal(messagesRes.status, 200);
  const messages = await messagesRes.json();
  assert.ok(messages.messages.length >= 1);

  const detailRes = await app(
    new Request(`http://localhost/v1/messages/${messages.messages[0].message_id}`, {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  assert.equal(detailRes.status, 200);
  const detail = await detailRes.json();
  assert.equal(detail.message_id, messages.messages[0].message_id);
  assert.equal(detail.mailbox_id, allocation.mailbox_id);

  const invoicesRes = await app(
    new Request("http://localhost/v1/billing/invoices?period=2026-03", {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  assert.equal(invoicesRes.status, 200);
  const invoices = await invoicesRes.json();
  assert.ok(Array.isArray(invoices.items));
});

test("fetch app requires dedicated admin token when configured", async () => {
  const cfg = createConfig({
    JWT_SECRET: "test-secret",
    ADMIN_API_TOKEN: "admin-secret",
    INTERNAL_API_TOKEN: "internal-secret",
    BASE_CHAIN_ID: "84532",
    MAILBOX_DOMAIN: "inbox.example.com",
    SIWE_MODE: "mock",
    PAYMENT_MODE: "mock",
  });
  const store = new MemoryStore({
    chainId: cfg.baseChainId,
    challengeTtlMs: cfg.siweChallengeTtlMs,
    mailboxDomain: cfg.mailboxDomain,
    webhookSecretEncryptionKey: cfg.webhookSecretEncryptionKey,
  });
  const app = createFetchApp({ config: cfg, store });
  const verify = await issueToken(app);

  const deniedRes = await app(
    new Request("http://localhost/v1/admin/overview/metrics", {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  assert.equal(deniedRes.status, 401);

  const allowedRes = await app(
    new Request("http://localhost/v1/admin/overview/metrics", {
      method: "GET",
      headers: { authorization: "Bearer admin-secret" },
    }),
  );
  assert.equal(allowedRes.status, 200);
});

test("fetch app admin API exposes live overview and lists", async () => {
  const app = makeApp();
  const verify = await issueToken(app);

  const allocateRes = await app(
    new Request("http://localhost/v1/mailboxes/allocate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "test", ttl_hours: 1 }),
    }),
  );
  assert.equal(allocateRes.status, 200);
  const allocation = await allocateRes.json();

  const metricsRes = await app(
    new Request("http://localhost/v1/admin/overview/metrics", {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  assert.equal(metricsRes.status, 200);
  const metrics = await metricsRes.json();
  assert.equal(metrics.active_tenants_24h, 1);
  assert.equal(metrics.active_mailbox_leases, 1);

  const tenantsRes = await app(
    new Request("http://localhost/v1/admin/tenants?page=1&page_size=20", {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  assert.equal(tenantsRes.status, 200);
  const tenants = await tenantsRes.json();
  assert.equal(tenants.total, 1);
  assert.equal(tenants.items[0].tenant_id, verify.tenant_id);

  const mailboxesRes = await app(
    new Request("http://localhost/v1/admin/mailboxes?tenant_id=" + verify.tenant_id, {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  assert.equal(mailboxesRes.status, 200);
  const mailboxes = await mailboxesRes.json();
  assert.equal(mailboxes.items.find((item) => item.mailbox_id === allocation.mailbox_id).status, "leased");
  assert.match(mailboxes.items[0].address, /@inbox\.example\.com$/);
});

test("fetch app admin actions mutate live resources", async () => {
  const app = makeApp();
  const verify = await issueToken(app, "0xabc0000000000000000000000000000000000456");

  const allocateRes = await app(
    new Request("http://localhost/v1/mailboxes/allocate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "test", ttl_hours: 1 }),
    }),
  );
  const allocation = await allocateRes.json();

  const freezeRes = await app(
    new Request(`http://localhost/v1/admin/mailboxes/${allocation.mailbox_id}/freeze`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
      },
      body: JSON.stringify({ reason: "abuse-review" }),
    }),
  );
  assert.equal(freezeRes.status, 200);

  const messagesRes = await app(
    new Request("http://localhost/v1/admin/messages?page=1&page_size=20", {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  const messages = await messagesRes.json();
  assert.ok(messages.items[0].message_id);

  const reparseRes = await app(
    new Request(`http://localhost/v1/admin/messages/${messages.items[0].message_id}/reparse`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
      },
      body: "{}",
    }),
  );
  assert.equal(reparseRes.status, 202);

  const riskRes = await app(
    new Request("http://localhost/v1/admin/risk/events?page=1&page_size=20", {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  const risk = await riskRes.json();
  assert.equal(risk.items[0].type, "mailbox.frozen");

  const auditRes = await app(
    new Request("http://localhost/v1/admin/audit/logs?page=1&page_size=20", {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  assert.equal(auditRes.status, 200);
  const audit = await auditRes.json();
  assert.ok(audit.items.some((item) => item.action === "message.reparse"));
});

test("fetch app provisions and releases mailboxes via mail provider", async () => {
  const cfg = createConfig({
    JWT_SECRET: "test-secret",
    BASE_CHAIN_ID: "84532",
    MAILBOX_DOMAIN: "inbox.example.com",
    SIWE_MODE: "mock",
    PAYMENT_MODE: "mock",
  });
  const store = new MemoryStore({
    chainId: cfg.baseChainId,
    challengeTtlMs: cfg.siweChallengeTtlMs,
    mailboxDomain: cfg.mailboxDomain,
  });
  const calls = [];
  const mailBackend = {
    async provisionMailbox(payload) {
      calls.push(["provision", payload.address]);
      return { providerRef: `mailu:${payload.address}` };
    },
    async releaseMailbox(payload) {
      calls.push(["release", payload.address]);
      return { status: "released" };
    },
  };
  const app = createFetchApp({ config: cfg, store, mailBackend });
  const verify = await issueToken(app, "0xabc0000000000000000000000000000000000abc");

  const allocateRes = await app(
    new Request("http://localhost/v1/mailboxes/allocate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "mailu-test", ttl_hours: 1 }),
    }),
  );
  assert.equal(allocateRes.status, 200);
  const allocation = await allocateRes.json();

  const releaseRes = await app(
    new Request("http://localhost/v1/mailboxes/release", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
      },
      body: JSON.stringify({ mailbox_id: allocation.mailbox_id }),
    }),
  );
  assert.equal(releaseRes.status, 200);
  assert.deepEqual(calls, [
    ["provision", "abc0000abc-1@inbox.example.com"],
    ["release", "abc0000abc-1@inbox.example.com"],
  ]);
});

test("fetch app accepts internal inbound events and stores message", async () => {
  const app = makeApp();
  const verify = await issueToken(app, "0xabc0000000000000000000000000000000000def");
  const inboundReceivedAt = new Date(Date.now() + 1000).toISOString();

  const allocateRes = await app(
    new Request("http://localhost/v1/mailboxes/allocate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "inbound", ttl_hours: 1 }),
    }),
  );
  const allocation = await allocateRes.json();

  const inboundRes = await app(
    new Request("http://localhost/internal/inbound/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer internal-secret",
      },
      body: JSON.stringify({
        address: allocation.address,
        provider_message_id: "mailu-msg-1",
        sender: "notify@example.com",
        sender_domain: "example.com",
        subject: "Inbound from Mailu",
        received_at: inboundReceivedAt,
        raw_ref: "mailu://raw/1",
        text_excerpt: "hello from mailu",
        headers: { "message-id": "<abc@example.com>" },
      }),
    }),
  );
  assert.equal(inboundRes.status, 202);
  const inbound = await inboundRes.json();

  const latestRes = await app(
    new Request(`http://localhost/v1/messages/latest?mailbox_id=${allocation.mailbox_id}&limit=20`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
    }),
  );
  assert.equal(latestRes.status, 200);
  const latest = await latestRes.json();
  assert.equal(latest.messages[0].message_id, inbound.message_id);
  assert.ok(latest.messages.some((item) => item.subject === "Inbound from Mailu"));
  assert.ok(latest.messages.some((item) => item.otp_code === "123456"));
});

test("fetch app deduplicates internal inbound events by provider message id", async () => {
  const app = makeApp();
  const verify = await issueToken(app, "0xabc0000000000000000000000000000000000dde");

  const allocateRes = await app(
    new Request("http://localhost/v1/mailboxes/allocate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "dedupe", ttl_hours: 1 }),
    }),
  );
  const allocation = await allocateRes.json();

  const payload = {
    address: allocation.address,
    provider_message_id: "mailu-msg-dedupe",
    sender: "notify@example.com",
    sender_domain: "example.com",
    subject: "Duplicate check",
    received_at: new Date().toISOString(),
    raw_ref: "mailu://raw/dedupe",
    text_excerpt: "code 445566",
  };

  const firstRes = await app(
    new Request("http://localhost/internal/inbound/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer internal-secret",
      },
      body: JSON.stringify(payload),
    }),
  );
  const secondRes = await app(
    new Request("http://localhost/internal/inbound/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer internal-secret",
      },
      body: JSON.stringify(payload),
    }),
  );

  const first = await firstRes.json();
  const second = await secondRes.json();
  assert.equal(first.message_id, second.message_id);

  const latestRes = await app(
    new Request(`http://localhost/v1/messages/latest?mailbox_id=${allocation.mailbox_id}&limit=20`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
    }),
  );
  const latest = await latestRes.json();
  assert.equal(latest.messages.filter((item) => item.subject === "Duplicate check").length, 1);
});

test("fetch app rejects internal inbound events without internal token", async () => {
  const app = makeApp();
  const res = await app(
    new Request("http://localhost/internal/inbound/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        address: "abc000-1@inbox.example.com",
        sender_domain: "example.com",
      }),
    }),
  );
  assert.equal(res.status, 401);
});

test("fetch app accepts internal mailbox provision and release callbacks", async () => {
  const app = makeApp();
  const verify = await issueToken(app, "0xabc0000000000000000000000000000000000fed");

  const allocateRes = await app(
    new Request("http://localhost/v1/mailboxes/allocate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "provisioned", ttl_hours: 1 }),
    }),
  );
  const allocation = await allocateRes.json();

  const provisionRes = await app(
    new Request("http://localhost/internal/mailboxes/provision", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer internal-secret",
      },
      body: JSON.stringify({
        address: allocation.address,
        provider_ref: '{"kind":"mailu-user","email":"abc0000fed-1@inbox.example.com"}',
      }),
    }),
  );
  assert.equal(provisionRes.status, 202);

  const mailboxesRes = await app(
    new Request("http://localhost/v1/admin/mailboxes?page=1&page_size=20", {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  const mailboxes = await mailboxesRes.json();
  assert.ok(
    mailboxes.items.some(
      (item) => item.mailbox_id === allocation.mailbox_id && item.address === "abc0000fed-1@inbox.example.com",
    ),
  );

  const releaseRes = await app(
    new Request("http://localhost/internal/mailboxes/release", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer internal-secret",
      },
      body: JSON.stringify({
        address: allocation.address,
        provider_ref: '{"kind":"mailu-user","email":"abc0000fed-1@inbox.example.com"}',
      }),
    }),
  );
  assert.equal(releaseRes.status, 202);

  const auditRes = await app(
    new Request("http://localhost/v1/admin/audit/logs?page=1&page_size=50", {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  const audit = await auditRes.json();
  assert.ok(audit.items.some((item) => item.action === "mailbox.backend_provisioned"));
  assert.ok(audit.items.some((item) => item.action === "mailbox.backend_released"));
});

test("fetch app exposes internal mailbox and message lookup endpoints", async () => {
  const app = makeApp();
  const verify = await issueToken(app, "0xabc0000000000000000000000000000000000aaa");

  const allocateRes = await app(
    new Request("http://localhost/v1/mailboxes/allocate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "lookup", ttl_hours: 1 }),
    }),
  );
  const allocation = await allocateRes.json();

  const inboundRes = await app(
    new Request("http://localhost/internal/inbound/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer internal-secret",
      },
      body: JSON.stringify({
        address: allocation.address,
        provider_message_id: "mailu-msg-lookup",
        sender: "notify@example.com",
        sender_domain: "example.com",
        subject: "Lookup payload",
        received_at: new Date().toISOString(),
        raw_ref: "mailu://raw/lookup",
        text_excerpt: "otp 778899",
      }),
    }),
  );
  assert.equal(inboundRes.status, 202);
  const inbound = await inboundRes.json();

  const mailboxRes = await app(
    new Request(`http://localhost/internal/mailboxes/${encodeURIComponent(allocation.address)}`, {
      method: "GET",
      headers: { authorization: "Bearer internal-secret" },
    }),
  );
  assert.equal(mailboxRes.status, 200);
  const mailbox = await mailboxRes.json();
  assert.equal(mailbox.mailbox_id, allocation.mailbox_id);
  assert.equal(mailbox.address, allocation.address);
  assert.equal(mailbox.active_lease.agent_id, verify.agent_id);

  const messageRes = await app(
    new Request(`http://localhost/internal/messages/${inbound.message_id}`, {
      method: "GET",
      headers: { authorization: "Bearer internal-secret" },
    }),
  );
  assert.equal(messageRes.status, 200);
  const message = await messageRes.json();
  assert.equal(message.message_id, inbound.message_id);
  assert.equal(message.provider_message_id, "mailu-msg-lookup");
  assert.equal(message.raw_ref, "mailu://raw/lookup");
  assert.equal(message.subject, "Lookup payload");
});

test("fetch app dispatches subscribed webhook after parsing inbound mail", async () => {
  const cfg = createConfig({
    JWT_SECRET: "test-secret",
    INTERNAL_API_TOKEN: "internal-secret",
    BASE_CHAIN_ID: "84532",
    MAILBOX_DOMAIN: "inbox.example.com",
    SIWE_MODE: "mock",
    PAYMENT_MODE: "mock",
  });
  const store = new MemoryStore({
    chainId: cfg.baseChainId,
    challengeTtlMs: cfg.siweChallengeTtlMs,
    mailboxDomain: cfg.mailboxDomain,
  });
  const deliveries = [];
  const webhookDispatcher = {
    async dispatch({ webhook, payload }) {
      deliveries.push({ webhookId: webhook.id, payload });
      return { ok: true, statusCode: 200 };
    },
  };
  const app = createFetchApp({ config: cfg, store, webhookDispatcher });
  const verify = await issueToken(app, "0xabc0000000000000000000000000000000000999");

  const createWebhookRes = await app(
    new Request("http://localhost/v1/webhooks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
      body: JSON.stringify({
        event_types: ["otp.extracted"],
        target_url: "https://example.com/hook",
        secret: "1234567890abcdef",
      }),
    }),
  );
  assert.equal(createWebhookRes.status, 200);

  const allocateRes = await app(
    new Request("http://localhost/v1/mailboxes/allocate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "hook", ttl_hours: 1 }),
    }),
  );
  const allocation = await allocateRes.json();

  const inboundRes = await app(
    new Request("http://localhost/internal/inbound/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer internal-secret",
      },
      body: JSON.stringify({
        address: allocation.address,
        sender: "notify@example.com",
        sender_domain: "example.com",
        subject: "Your code is 654321",
        text_excerpt: "Click https://example.com/verify?token=abc",
      }),
    }),
  );
  assert.equal(inboundRes.status, 202);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].payload.event_type, "otp.extracted");
  assert.equal(deliveries[0].payload.otp_code, "654321");

  const webhooksRes = await app(
    new Request("http://localhost/v1/admin/webhooks?page=1&page_size=20", {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  const webhooks = await webhooksRes.json();
  assert.equal(webhooks.items[0].last_status_code, 200);
});

test("fetch app parses otp and link from html inbound content", async () => {
  const app = makeApp();
  const verify = await issueToken(app, "0xabc0000000000000000000000000000000000777");

  const allocateRes = await app(
    new Request("http://localhost/v1/mailboxes/allocate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "html-parse", ttl_hours: 1 }),
    }),
  );
  const allocation = await allocateRes.json();

  const inboundRes = await app(
    new Request("http://localhost/internal/inbound/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer internal-secret",
      },
      body: JSON.stringify({
        address: allocation.address,
        sender_domain: "example.com",
        subject: "Verify login",
        html_body: "<html><body><p>Your verification code: <strong>ABCD12</strong></p><a href='https://verify.example.com/t/1'>Continue</a></body></html>",
      }),
    }),
  );
  assert.equal(inboundRes.status, 202);

  const latestRes = await app(
    new Request(`http://localhost/v1/messages/latest?mailbox_id=${allocation.mailbox_id}&limit=20`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
    }),
  );
  const latest = await latestRes.json();
  const parsed = latest.messages.find((item) => item.subject === "Verify login");
  assert.equal(parsed.otp_code, "ABCD12");
  assert.match(parsed.verification_link, /https:\/\/verify\.example\.com\/t\/1/);
});

test("fetch app marks message as failed when parser finds no otp or link", async () => {
  const app = makeApp();
  const verify = await issueToken(app, "0xabc0000000000000000000000000000000000666");

  const allocateRes = await app(
    new Request("http://localhost/v1/mailboxes/allocate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "parse-fail", ttl_hours: 1 }),
    }),
  );
  const allocation = await allocateRes.json();

  const inboundRes = await app(
    new Request("http://localhost/internal/inbound/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer internal-secret",
      },
      body: JSON.stringify({
        address: allocation.address,
        sender_domain: "example.com",
        subject: "Welcome",
        text_excerpt: "Thanks for joining our service.",
      }),
    }),
  );
  assert.equal(inboundRes.status, 202);

  const messagesRes = await app(
    new Request("http://localhost/v1/admin/messages?page=1&page_size=50", {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  const messages = await messagesRes.json();
  const failed = messages.items.find((item) => item.subject === "Welcome");
  assert.equal(failed.parsed_status, "failed");
  assert.equal(failed.otp_extracted, false);
});
