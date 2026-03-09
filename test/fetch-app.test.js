import test from "node:test";
import assert from "node:assert/strict";
import { createFetchApp } from "../src/fetch-app.js";
import { MemoryStore } from "../src/storage/memory-store.js";
import { createConfig } from "../src/config.js";

function makeApp(overrides = {}) {
  const cfg = createConfig({
    JWT_SECRET: "test-secret",
    INTERNAL_API_TOKEN: "internal-secret",
    BASE_CHAIN_ID: "84532",
    MAILBOX_DOMAIN: "inbox.example.com",
    SIWE_MODE: "mock",
    PAYMENT_MODE: "mock",
    ...overrides,
  });
  const store = new MemoryStore({
    chainId: cfg.baseChainId,
    challengeTtlMs: cfg.siweChallengeTtlMs,
    mailboxDomain: cfg.mailboxDomain,
  });
  const app = createFetchApp({ config: cfg, store });
  app.store = store;
  return app;
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

test("fetch app strict challenge preserves wallet address casing for SIWE message creation", async () => {
  const cfg = createConfig({
    JWT_SECRET: "test-secret",
    INTERNAL_API_TOKEN: "internal-secret",
    BASE_CHAIN_ID: "84532",
    MAILBOX_DOMAIN: "inbox.example.com",
    SIWE_MODE: "strict",
    PAYMENT_MODE: "mock",
  });
  const store = new MemoryStore({
    chainId: cfg.baseChainId,
    challengeTtlMs: cfg.siweChallengeTtlMs,
    mailboxDomain: cfg.mailboxDomain,
  });
  const calls = [];
  const app = createFetchApp({
    config: cfg,
    store,
    siweService: {
      async createChallengeMessage(walletAddress, nonce) {
        calls.push({ walletAddress, nonce });
        return `message-for:${walletAddress}:${nonce}`;
      },
      async parseMessage() {
        return { address: "", nonce: "" };
      },
      async verifySignature() {
        return { ok: false, message: "unused" };
      },
    },
  });

  const wallet = "0x274223FfDE6dd6855824b7A4B7Ce132B065837B8";
  const res = await app(
    new Request("http://localhost/v1/auth/siwe/challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet_address: wallet }),
    }),
  );

  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].walletAddress, wallet);
});

test("fetch app serves admin dashboard html", async () => {
  const app = makeApp();
  const res = await app(new Request("http://localhost/admin", { method: "GET" }));
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Admin Dashboard/);
  assert.match(html, /Live API/);
  assert.match(html, /Tenant Limits/);
  assert.match(html, /Active Runtime Limits/);
  assert.match(html, /Save Tenant Limits/);
  assert.match(html, /Save Runtime Limits/);
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
  assert.match(html, /Send Test Guide/);
  assert.match(html, /Connect MetaMask/);
  assert.match(html, /MetaMask status not checked yet/);
  assert.match(html, /Agents Guide/);
});

test("fetch app serves agents guide html", async () => {
  const app = makeApp();
  const res = await app(new Request("http://localhost/agents-guide", { method: "GET" }));
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Agents Guide/);
  assert.match(html, /Production Guide/);
  assert.match(html, /Direct Production Flow/);
  assert.match(html, /Allocate a mailbox/);
  assert.match(html, /Open User App/);
  assert.match(html, /api\.mailagents\.net/);
});

test("fetch app exposes runtime meta for the user app", async () => {
  const app = makeApp();
  const res = await app(new Request("http://localhost/v1/meta/runtime", { method: "GET" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.siwe_mode, "mock");
  assert.equal(body.payment_mode, "mock");
  assert.equal(body.mailbox_domain, "inbox.example.com");
  assert.equal(body.base_chain_id, 84532);
  assert.equal(body.chain_name, "Base Sepolia");
  assert.equal(body.chain_hex, "0x14a34");
  assert.equal(body.overage_charge_usdc, 0.001);
  assert.equal(body.agent_allocate_hourly_limit, 5);
  assert.deepEqual(body.chain_rpc_urls, ["https://sepolia.base.org"]);
  assert.deepEqual(body.chain_explorer_urls, ["https://sepolia.basescan.org"]);
});

test("fetch app issues a tenant payment proof for over-limit hmac endpoints", async () => {
  const cfg = createConfig({
    JWT_SECRET: "test-secret",
    INTERNAL_API_TOKEN: "internal-secret",
    BASE_CHAIN_ID: "84532",
    MAILBOX_DOMAIN: "inbox.example.com",
    SIWE_MODE: "mock",
    PAYMENT_MODE: "hmac",
    X402_HMAC_SECRET: "proof-secret",
  });
  const store = new MemoryStore({
    chainId: cfg.baseChainId,
    challengeTtlMs: cfg.siweChallengeTtlMs,
    mailboxDomain: cfg.mailboxDomain,
  });
  const app = createFetchApp({ config: cfg, store });
  const verify = await issueToken(app, "0xabc0000000000000000000000000000000000666");

  const proofRes = await app(
    new Request("http://localhost/v1/payments/proof", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
      },
      body: JSON.stringify({ method: "POST", path: "/v1/mailboxes/allocate" }),
    }),
  );
  assert.equal(proofRes.status, 200);
  const proofBody = await proofRes.json();
  assert.match(proofBody.x_payment_proof, /^t=\d+,v1=[0-9a-f]+$/);
  assert.equal(proofBody.amount_usdc, 0.001);

  const allocateRes = await app(
    new Request("http://localhost/v1/mailboxes/allocate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": proofBody.x_payment_proof,
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "hmac-proof", ttl_hours: 1 }),
    }),
  );
  assert.equal(allocateRes.status, 200);

  const sendProofRes = await app(
    new Request("http://localhost/v1/payments/proof", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
      },
      body: JSON.stringify({ method: "POST", path: "/v1/messages/send" }),
    }),
  );
  assert.equal(sendProofRes.status, 200);
});

test("fetch app requires payment after agent hourly allocate limit and records invoice charge", async () => {
  const app = makeApp({ AGENT_ALLOCATE_HOURLY_LIMIT: "1" });
  const verify = await issueToken(app, "0xabc0000000000000000000000000000000000667");

  const firstAllocateRes = await app(
    new Request("http://localhost/v1/mailboxes/allocate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "free-allocate", ttl_hours: 1 }),
    }),
  );
  assert.equal(firstAllocateRes.status, 200);

  const secondDeniedRes = await app(
    new Request("http://localhost/v1/mailboxes/allocate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "paid-allocate", ttl_hours: 1 }),
    }),
  );
  assert.equal(secondDeniedRes.status, 402);
  const deniedBody = await secondDeniedRes.json();
  assert.equal(deniedBody.amount_usdc, 0.001);
  assert.equal(deniedBody.reasons[0].code, "agent_allocate_hourly");

  const secondPaidRes = await app(
    new Request("http://localhost/v1/mailboxes/allocate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "paid-allocate", ttl_hours: 1 }),
    }),
  );
  assert.equal(secondPaidRes.status, 200);

  const invoicesRes = await app(
    new Request("http://localhost/v1/billing/invoices", {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  assert.equal(invoicesRes.status, 200);
  const invoices = await invoicesRes.json();
  assert.equal(invoices.items[0].amount_usdc, 0.001);
});

test("fetch app requires payment after tenant qps limit and still allows paid bypass", async () => {
  const app = makeApp();
  const verify = await issueToken(app, "0xabc0000000000000000000000000000000000668");

  const store = app.store || null;
  await store?.adminPatchTenant?.(verify.tenant_id, { quotas: { qps: 1 } });

  const allocateRes = await app(
    new Request("http://localhost/v1/mailboxes/allocate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "seed-mailbox", ttl_hours: 1 }),
    }),
  );
  assert.equal(allocateRes.status, 200);
  const allocation = await allocateRes.json();

  const limitedRes = await app(
    new Request(`http://localhost/v1/messages/latest?mailbox_id=${allocation.mailbox_id}&limit=10`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${verify.access_token}`,
      },
    }),
  );
  assert.equal(limitedRes.status, 402);
  const limitedBody = await limitedRes.json();
  assert.equal(limitedBody.reasons[0].code, "tenant_qps");

  const paidRes = await app(
    new Request(`http://localhost/v1/messages/latest?mailbox_id=${allocation.mailbox_id}&limit=10`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
    }),
  );
  assert.equal(paidRes.status, 200);
});

test("fetch app blocks suspended tenants even with payment proof", async () => {
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
  const app = createFetchApp({ config: cfg, store });
  const verify = await issueToken(app, "0xabc0000000000000000000000000000000000669");

  await store.adminPatchTenant(verify.tenant_id, { status: "suspended" });

  const res = await app(
    new Request("http://localhost/v1/webhooks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
      body: JSON.stringify({
        event_types: ["otp.extracted"],
        target_url: "https://example.com/blocked-webhook",
        secret: "1234567890abcdef",
      }),
    }),
  );
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error, "tenant_inactive");
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

test("fetch app sends mail through the backend adapter", async () => {
  const app = makeApp();
  const verify = await issueToken(app, "0xabc0000000000000000000000000000000000555");

  const allocateRes = await app(
    new Request("http://localhost/v1/mailboxes/allocate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "send-mail", ttl_hours: 1 }),
    }),
  );
  assert.equal(allocateRes.status, 200);
  const allocation = await allocateRes.json();

  const sendRes = await app(
    new Request("http://localhost/v1/messages/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
      body: JSON.stringify({
        mailbox_id: allocation.mailbox_id,
        to: "receiver@example.com",
        subject: "hello",
        text: "mail body",
        mailbox_password: allocation.webmail_password,
      }),
    }),
  );
  assert.equal(sendRes.status, 200);
  const sent = await sendRes.json();
  assert.equal(sent.from, allocation.address);
  assert.deepEqual(sent.accepted, ["receiver@example.com"]);
  assert.match(sent.message_id, /^noop:/);
});

test("fetch app exposes v2 messages and send attempts read endpoints", async () => {
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
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "v2-read", ttl_hours: 1 }),
    }),
  );
  assert.equal(allocateRes.status, 200);
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
  const inbound = await inboundRes.json();

  const sendRes = await app(
    new Request("http://localhost/v1/messages/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
      body: JSON.stringify({
        mailbox_id: allocation.mailbox_id,
        to: ["receiver@example.com"],
        subject: "hello-v2",
        text: "mail body",
        mailbox_password: allocation.webmail_password,
      }),
    }),
  );
  assert.equal(sendRes.status, 200);
  const sent = await sendRes.json();

  const v2MessagesRes = await app(
    new Request(`http://localhost/v2/messages?mailbox_id=${allocation.mailbox_id}&page=1&page_size=20`, {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  assert.equal(v2MessagesRes.status, 200);
  const v2Messages = await v2MessagesRes.json();
  assert.equal(v2Messages.total, 1);
  assert.equal(v2Messages.items[0].message_id, inbound.message_id);
  assert.equal(v2Messages.items[0].message_status, "parsed");
  assert.equal(v2Messages.items[0].otp_code, "654321");

  const v2MessageDetailRes = await app(
    new Request(`http://localhost/v2/messages/${inbound.message_id}`, {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  assert.equal(v2MessageDetailRes.status, 200);
  const v2MessageDetail = await v2MessageDetailRes.json();
  assert.equal(v2MessageDetail.message_id, inbound.message_id);
  assert.equal(v2MessageDetail.message_status, "parsed");
  assert.equal(v2MessageDetail.verification_link, "https://example.com/verify?token=abc");

  const sendAttemptsRes = await app(
    new Request(`http://localhost/v2/send-attempts?mailbox_id=${allocation.mailbox_id}&page=1&page_size=20`, {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  assert.equal(sendAttemptsRes.status, 200);
  const sendAttempts = await sendAttemptsRes.json();
  assert.equal(sendAttempts.total, 1);
  assert.equal(sendAttempts.items[0].send_attempt_id, sent.send_attempt_id);
  assert.equal(sendAttempts.items[0].submission_status, "accepted");

  const sendAttemptDetailRes = await app(
    new Request(`http://localhost/v2/send-attempts/${sent.send_attempt_id}`, {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  assert.equal(sendAttemptDetailRes.status, 200);
  const sendAttemptDetail = await sendAttemptDetailRes.json();
  assert.equal(sendAttemptDetail.send_attempt_id, sent.send_attempt_id);
  assert.deepEqual(sendAttemptDetail.recipients, ["receiver@example.com"]);
  assert.equal(sendAttemptDetail.submission_status, "accepted");
});

test("fetch app accepts v2 messages send and returns attempt-oriented response", async () => {
  const app = makeApp();
  const verify = await issueToken(app, "0xabc0000000000000000000000000000000000779");

  const allocateRes = await app(
    new Request("http://localhost/v1/mailboxes/allocate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "v2-send", ttl_hours: 1 }),
    }),
  );
  assert.equal(allocateRes.status, 200);
  const allocation = await allocateRes.json();

  const sendRes = await app(
    new Request("http://localhost/v2/messages/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
      },
      body: JSON.stringify({
        mailbox_id: allocation.mailbox_id,
        to: ["receiver@example.com"],
        subject: "hello-v2-send",
        text: "mail body",
        mailbox_password: allocation.webmail_password,
      }),
    }),
  );
  assert.equal(sendRes.status, 202);
  const sent = await sendRes.json();
  assert.ok(sent.send_attempt_id);
  assert.equal(sent.mailbox_id, allocation.mailbox_id);
  assert.equal(sent.from_address, allocation.address);
  assert.equal(sent.submission_status, "accepted");
  assert.equal(sent.job_status, "completed");
  assert.deepEqual(sent.accepted, ["receiver@example.com"]);

  const attemptRes = await app(
    new Request(`http://localhost/v2/send-attempts/${sent.send_attempt_id}`, {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  assert.equal(attemptRes.status, 200);
  const attempt = await attemptRes.json();
  assert.equal(attempt.send_attempt_id, sent.send_attempt_id);
  assert.equal(attempt.submission_status, "accepted");
});

test("fetch app exposes v2 mailbox accounts and leases endpoints", async () => {
  const app = makeApp();
  const verify = await issueToken(app, "0xabc0000000000000000000000000000000000778");

  const createLeaseRes = await app(
    new Request("http://localhost/v2/mailboxes/leases", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "v2-lease", ttl_hours: 1 }),
    }),
  );
  assert.equal(createLeaseRes.status, 202);
  const createdLease = await createLeaseRes.json();
  assert.ok(createdLease.lease_id);
  assert.ok(createdLease.mailbox_account_id);
  assert.equal(createdLease.lease_status, "active");

  const accountsRes = await app(
    new Request("http://localhost/v2/mailboxes/accounts?page=1&page_size=20", {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  assert.equal(accountsRes.status, 200);
  const accounts = await accountsRes.json();
  assert.equal(accounts.total, 5);
  const leasedAccount = accounts.items.find((item) => item.mailbox_id === createdLease.mailbox_id);
  assert.ok(leasedAccount?.mailbox_account_id);
  assert.equal(leasedAccount?.backend_status, "active");

  const leasesRes = await app(
    new Request("http://localhost/v2/mailboxes/leases?page=1&page_size=20", {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  assert.equal(leasesRes.status, 200);
  const leases = await leasesRes.json();
  assert.equal(leases.total, 1);
  assert.equal(leases.items[0].lease_id, createdLease.lease_id);
  assert.equal(leases.items[0].mailbox_id, createdLease.mailbox_id);

  const leaseDetailRes = await app(
    new Request(`http://localhost/v2/mailboxes/leases/${createdLease.lease_id}`, {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  assert.equal(leaseDetailRes.status, 200);
  const leaseDetail = await leaseDetailRes.json();
  assert.equal(leaseDetail.lease_id, createdLease.lease_id);
  assert.equal(leaseDetail.address, createdLease.address);

  const releaseRes = await app(
    new Request(`http://localhost/v2/mailboxes/leases/${createdLease.lease_id}/release`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
      },
      body: "{}",
    }),
  );
  assert.equal(releaseRes.status, 202);
  const released = await releaseRes.json();
  assert.equal(released.lease_id, createdLease.lease_id);
  assert.equal(released.lease_status, "released");
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

test("fetch app admin tenant detail includes editable quota fields", async () => {
  const app = makeApp();
  const verify = await issueToken(app, "0xabc0000000000000000000000000000000000670");

  await app(
    new Request("http://localhost/v1/admin/tenants/" + verify.tenant_id, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
      },
      body: JSON.stringify({ quotas: { qps: 9, mailbox_limit: 12 } }),
    }),
  );

  const res = await app(
    new Request("http://localhost/v1/admin/tenants/" + verify.tenant_id, {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.quotas.qps, 9);
  assert.equal(body.quotas.mailbox_limit, 12);
});

test("fetch app admin can update runtime limit settings", async () => {
  const app = makeApp();
  const verify = await issueToken(app, "0xabc0000000000000000000000000000000000671");

  const patchRes = await app(
    new Request("http://localhost/v1/admin/settings/limits", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
      },
      body: JSON.stringify({ overage_charge_usdc: 0.0025, agent_allocate_hourly_limit: 7 }),
    }),
  );
  assert.equal(patchRes.status, 200);
  const patched = await patchRes.json();
  assert.equal(patched.overage_charge_usdc, 0.0025);
  assert.equal(patched.agent_allocate_hourly_limit, 7);

  const runtimeRes = await app(new Request("http://localhost/v1/meta/runtime", { method: "GET" }));
  assert.equal(runtimeRes.status, 200);
  const runtime = await runtimeRes.json();
  assert.equal(runtime.overage_charge_usdc, 0.0025);
  assert.equal(runtime.agent_allocate_hourly_limit, 7);
});

test("updated runtime overage amount is used in payment-required responses", async () => {
  const app = makeApp({ AGENT_ALLOCATE_HOURLY_LIMIT: "1" });
  const verify = await issueToken(app, "0xabc0000000000000000000000000000000000672");

  const patchRes = await app(
    new Request("http://localhost/v1/admin/settings/limits", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
      },
      body: JSON.stringify({ overage_charge_usdc: 0.003 }),
    }),
  );
  assert.equal(patchRes.status, 200);

  const firstAllocateRes = await app(
    new Request("http://localhost/v1/mailboxes/allocate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "free-allocate", ttl_hours: 1 }),
    }),
  );
  assert.equal(firstAllocateRes.status, 200);

  const secondDeniedRes = await app(
    new Request("http://localhost/v1/mailboxes/allocate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "paid-allocate", ttl_hours: 1 }),
    }),
  );
  assert.equal(secondDeniedRes.status, 402);
  const denied = await secondDeniedRes.json();
  assert.equal(denied.amount_usdc, 0.003);
});

test("runtime settings persist across app instances when store retains them", async () => {
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

  const appA = createFetchApp({ config: cfg, store });
  const verify = await issueToken(appA, "0xabc0000000000000000000000000000000000673");

  const patchRes = await appA(
    new Request("http://localhost/v1/admin/settings/limits", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
      },
      body: JSON.stringify({ overage_charge_usdc: 0.0042, agent_allocate_hourly_limit: 11 }),
    }),
  );
  assert.equal(patchRes.status, 200);

  const appB = createFetchApp({ config: cfg, store });
  const runtimeRes = await appB(new Request("http://localhost/v1/meta/runtime", { method: "GET" }));
  assert.equal(runtimeRes.status, 200);
  const runtime = await runtimeRes.json();
  assert.equal(runtime.overage_charge_usdc, 0.0042);
  assert.equal(runtime.agent_allocate_hourly_limit, 11);
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
  assert.ok(mailboxes.items[0].mailbox_account_id);
  assert.equal(mailboxes.items[0].lease_v2_status, "active");

  const sendRes = await app(
    new Request("http://localhost/v1/messages/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
      body: JSON.stringify({
        mailbox_id: allocation.mailbox_id,
        to: ["ops@example.com"],
        subject: "Admin visible send",
        text: "body",
        mailbox_password: allocation.webmail_password,
      }),
    }),
  );
  assert.equal(sendRes.status, 200);

  const sendAttemptsRes = await app(
    new Request("http://localhost/v1/admin/send-attempts?tenant_id=" + verify.tenant_id, {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  assert.equal(sendAttemptsRes.status, 200);
  const sendAttempts = await sendAttemptsRes.json();
  assert.equal(sendAttempts.total, 1);
  assert.equal(sendAttempts.items[0].mailbox_id, allocation.mailbox_id);
  assert.ok(sendAttempts.items[0].mailbox_account_id);
  assert.equal(sendAttempts.items[0].submission_status, "accepted");
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
  const parsedMessage = messages.items.find((item) => item.parsed_status === "parsed");
  assert.ok(parsedMessage?.mailbox_account_id);
  assert.equal(parsedMessage?.message_v2_status, "parsed");

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

  const state = app.store.getStateForTests();
  const v2Message = state.messagesV2.get(inbound.message_id);
  assert.ok(v2Message);
  assert.equal(v2Message.messageStatus, "parse_failed");
  const rawMessage = state.rawMessagesV2.get(v2Message.rawMessageId);
  assert.ok(rawMessage);
  assert.equal(rawMessage.backendMessageId, "mailu-msg-1");
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
  const inboundBody = await inboundRes.json();
  assert.ok(inboundBody.parse_job_id);
  assert.equal(inboundBody.parse_job_status, "completed");
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

  const deliveriesRes = await app(
    new Request("http://localhost/v2/webhooks/deliveries?page=1&page_size=20", {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  assert.equal(deliveriesRes.status, 200);
  const deliveriesBody = await deliveriesRes.json();
  assert.equal(deliveriesBody.total, 1);
  assert.equal(deliveriesBody.items[0].event_type, "otp.extracted");
  assert.equal(deliveriesBody.items[0].status_code, 200);
  assert.equal(deliveriesBody.items[0].ok, true);
});

test("fetch app admin can inspect webhook delivery failure history", async () => {
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
  const webhookDispatcher = {
    async dispatch() {
      return {
        ok: false,
        statusCode: 503,
        attempts: 3,
        deliveryId: "delivery-failed",
        errorMessage: "Webhook returned HTTP 503",
        responseExcerpt: "upstream down",
      };
    },
  };
  const app = createFetchApp({ config: cfg, store, webhookDispatcher });
  const verify = await issueToken(app, "0xabc0000000000000000000000000000000000998");

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
  const webhook = await createWebhookRes.json();

  const allocateRes = await app(
    new Request("http://localhost/v1/mailboxes/allocate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${verify.access_token}`,
        "x-payment-proof": "mock-proof",
      },
      body: JSON.stringify({ agent_id: verify.agent_id, purpose: "hook-fail", ttl_hours: 1 }),
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

  const adminDeliveriesRes = await app(
    new Request(`http://localhost/v1/admin/webhook-deliveries?page=1&page_size=20&webhook_id=${webhook.webhook_id}`, {
      method: "GET",
      headers: { authorization: `Bearer ${verify.access_token}` },
    }),
  );
  assert.equal(adminDeliveriesRes.status, 200);
  const adminDeliveries = await adminDeliveriesRes.json();
  assert.equal(adminDeliveries.total, 1);
  assert.equal(adminDeliveries.items[0].status_code, 503);
  assert.equal(adminDeliveries.items[0].ok, false);
  assert.equal(adminDeliveries.items[0].error_message, "Webhook returned HTTP 503");
  assert.equal(adminDeliveries.items[0].response_excerpt, "upstream down");
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
  assert.ok(failed.mailbox_account_id);
  assert.equal(failed.message_v2_status, "parse_failed");

  const state = app.store.getStateForTests();
  const failedMessage = [...state.messagesV2.values()].find((item) => item.subject === "Welcome");
  assert.ok(failedMessage);
  assert.equal(failedMessage.messageStatus, "parse_failed");
  const parseResults = state.messageParseResultsV2.get(failedMessage.id) || [];
  assert.equal(parseResults.at(-1)?.parseStatus, "failed");
});
