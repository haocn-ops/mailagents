import test from "node:test";
import assert from "node:assert/strict";
import { createFetchApp } from "../src/fetch-app.js";
import { MemoryStore } from "../src/storage/memory-store.js";
import { createConfig } from "../src/config.js";

function makeApp() {
  const cfg = createConfig({
    JWT_SECRET: "test-secret",
    BASE_CHAIN_ID: "84532",
    SIWE_MODE: "mock",
    PAYMENT_MODE: "mock",
  });
  const store = new MemoryStore({ chainId: cfg.baseChainId, challengeTtlMs: cfg.siweChallengeTtlMs });
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
