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

test("fetch app health endpoint", async () => {
  const app = makeApp();
  const res = await app(new Request("http://localhost/healthz", { method: "GET" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "ok");
});

test("fetch app auth challenge + verify", async () => {
  const app = makeApp();
  const wallet = "0xabc0000000000000000000000000000000000123";

  const challengeRes = await app(
    new Request("http://localhost/v1/auth/siwe/challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet_address: wallet }),
    }),
  );
  assert.equal(challengeRes.status, 200);
  const challenge = await challengeRes.json();

  const verifyRes = await app(
    new Request("http://localhost/v1/auth/siwe/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: challenge.message, signature: "0xsignature" }),
    }),
  );

  assert.equal(verifyRes.status, 200);
  const verify = await verifyRes.json();
  assert.ok(verify.access_token);
});
