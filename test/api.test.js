import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { createApp } from "../src/app.js";
import { getStateForTests } from "../src/store.js";
import { buildHmacPaymentProof, createPaymentVerifier } from "../src/payment.js";
import { createSiweService } from "../src/siwe.js";
import { MemoryStore } from "../src/storage/memory-store.js";

async function invoke(app, { method, path, headers = {}, body }) {
  const req = new PassThrough();
  req.method = method;
  req.url = path;
  req.headers = headers;

  const res = new PassThrough();
  res.statusCode = 200;
  const outHeaders = {};

  res.writeHead = (statusCode, headerMap = {}) => {
    res.statusCode = statusCode;
    Object.assign(outHeaders, headerMap);
    return res;
  };

  const chunks = [];
  res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));

  const finished = new Promise((resolve, reject) => {
    res.on("finish", () => {
      const text = Buffer.concat(chunks).toString("utf8") || "{}";
      try {
        resolve({
          status: res.statusCode,
          headers: outHeaders,
          body: JSON.parse(text),
        });
      } catch (err) {
        reject(err);
      }
    });
    res.on("error", reject);
  });

  const run = app(req, res);

  if (body !== undefined) {
    req.write(typeof body === "string" ? body : JSON.stringify(body));
  }
  req.end();

  await run;
  return finished;
}

test("auth challenge and verify issues token", async () => {
  const app = createApp();
  const wallet = "0xabc0000000000000000000000000000000000123";

  const challenge = await invoke(app, {
    method: "POST",
    path: "/v1/auth/siwe/challenge",
    headers: { "content-type": "application/json" },
    body: { wallet_address: wallet },
  });

  assert.equal(challenge.status, 200);
  assert.ok(challenge.body.nonce);
  assert.ok(challenge.body.message.includes(wallet));

  const verify = await invoke(app, {
    method: "POST",
    path: "/v1/auth/siwe/verify",
    headers: { "content-type": "application/json" },
    body: { message: challenge.body.message, signature: "0xsignature" },
  });

  assert.equal(verify.status, 200);
  assert.equal(verify.body.token_type, "Bearer");
  assert.ok(verify.body.access_token);
  assert.ok(verify.body.did.startsWith("did:pkh:eip155:"));
});

test("health endpoint returns ok", async () => {
  const app = createApp();
  const res = await invoke(app, {
    method: "GET",
    path: "/healthz",
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
});

test("allocate and messages require x402 payment proof", async () => {
  const app = createApp();
  const wallet = "0xabc0000000000000000000000000000000000456";

  const challenge = await invoke(app, {
    method: "POST",
    path: "/v1/auth/siwe/challenge",
    headers: { "content-type": "application/json" },
    body: { wallet_address: wallet },
  });

  const verify = await invoke(app, {
    method: "POST",
    path: "/v1/auth/siwe/verify",
    headers: { "content-type": "application/json" },
    body: { message: challenge.body.message, signature: "0xsignature" },
  });

  const token = verify.body.access_token;

  const withoutPayment = await invoke(app, {
    method: "POST",
    path: "/v1/mailboxes/allocate",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: {
      agent_id: verify.body.agent_id,
      purpose: "signup",
      ttl_hours: 1,
    },
  });

  assert.equal(withoutPayment.status, 402);

  const allocated = await invoke(app, {
    method: "POST",
    path: "/v1/mailboxes/allocate",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-payment-proof": "mock-proof",
    },
    body: {
      agent_id: verify.body.agent_id,
      purpose: "signup",
      ttl_hours: 1,
    },
  });

  assert.equal(allocated.status, 200);
  assert.ok(allocated.body.mailbox_id);

  const latest = await invoke(app, {
    method: "GET",
    path: `/v1/messages/latest?mailbox_id=${allocated.body.mailbox_id}&limit=10`,
    headers: {
      authorization: `Bearer ${token}`,
      "x-payment-proof": "mock-proof",
    },
  });

  assert.equal(latest.status, 200);
  assert.ok(Array.isArray(latest.body.messages));
});

test("usage summary and invoice detail are available", async () => {
  const app = createApp();
  const wallet = "0xabc0000000000000000000000000000000000789";

  const challenge = await invoke(app, {
    method: "POST",
    path: "/v1/auth/siwe/challenge",
    headers: { "content-type": "application/json" },
    body: { wallet_address: wallet },
  });

  const verify = await invoke(app, {
    method: "POST",
    path: "/v1/auth/siwe/verify",
    headers: { "content-type": "application/json" },
    body: { message: challenge.body.message, signature: "0xsignature" },
  });

  const token = verify.body.access_token;

  await invoke(app, {
    method: "POST",
    path: "/v1/webhooks",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-payment-proof": "mock-proof",
    },
    body: {
      event_types: ["otp.extracted"],
      target_url: "https://example.com/callback",
      secret: "1234567890abcdef",
    },
  });

  const now = new Date();
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const usage = await invoke(app, {
    method: "GET",
    path: `/v1/usage/summary?period=${period}`,
    headers: { authorization: `Bearer ${token}` },
  });

  assert.equal(usage.status, 200);
  assert.ok(Number.isFinite(usage.body.billable_units));

  const state = getStateForTests();
  const invoice = [...state.invoices.values()].find((i) => i.tenantId === verify.body.tenant_id);
  assert.ok(invoice);

  const invoiceDetail = await invoke(app, {
    method: "GET",
    path: `/v1/billing/invoices/${invoice.id}`,
    headers: { authorization: `Bearer ${token}` },
  });

  assert.equal(invoiceDetail.status, 200);
  assert.equal(invoiceDetail.body.invoice_id, invoice.id);
});

test("memory store uses configured mailbox domain", async () => {
  const store = new MemoryStore({
    chainId: 84532,
    challengeTtlMs: 1000,
    mailboxDomain: "inbox.example.com",
  });

  const identity = await store.getOrCreateIdentity("0xabc0000000000000000000000000000000000abc");
  const allocation = await store.allocateMailbox({
    tenantId: identity.tenantId,
    agentId: identity.agentId,
    purpose: "signup",
    ttlHours: 1,
  });

  assert.match(allocation.mailbox.address, /@inbox\.example\.com$/);
});

test("siwe challenge expires by ttl", async () => {
  const app = createApp({
    store: new MemoryStore({ chainId: 84532, challengeTtlMs: 1 }),
  });

  const wallet = "0xabc0000000000000000000000000000000000999";
  const challenge = await invoke(app, {
    method: "POST",
    path: "/v1/auth/siwe/challenge",
    headers: { "content-type": "application/json" },
    body: { wallet_address: wallet },
  });

  await new Promise((resolve) => setTimeout(resolve, 5));

  const verify = await invoke(app, {
    method: "POST",
    path: "/v1/auth/siwe/verify",
    headers: { "content-type": "application/json" },
    body: { message: challenge.body.message, signature: "0xsignature" },
  });

  assert.equal(verify.status, 401);
  assert.equal(verify.body.error, "unauthorized");
});

test("hmac payment verifier validates method/path/timestamp", async () => {
  const secret = "test-hmac-secret";
  const verifier = createPaymentVerifier({
    mode: "hmac",
    hmacSecret: secret,
    hmacSkewSec: 300,
  });

  const timestampSec = Math.floor(Date.now() / 1000);
  const proof = buildHmacPaymentProof({
    secret,
    method: "POST",
    path: "/v1/mailboxes/allocate",
    timestampSec,
  });

  const okReq = {
    method: "POST",
    url: "/v1/mailboxes/allocate?foo=bar",
    headers: { "x-payment-proof": proof },
  };

  const badReq = {
    method: "GET",
    url: "/v1/mailboxes/allocate",
    headers: { "x-payment-proof": proof },
  };

  assert.equal(verifier.verify(okReq).ok, true);
  assert.equal(verifier.verify(badReq).ok, false);
});

test("siwe strict mode is available or reports missing dependency clearly", async () => {
  const siwe = createSiweService({
    mode: "strict",
    chainId: 84532,
    domain: "localhost",
    uri: "http://localhost",
    statement: "Sign in",
  });

  try {
    const message = await siwe.createChallengeMessage(
      "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
      "a1b2c3d4e5f6g7h8",
    );
    assert.ok(typeof message === "string");
    assert.ok(message.includes("Sign in"));
  } catch (err) {
    assert.match(String(err.message || err), /SIWE strict mode requires package 'siwe'/);
  }
});
