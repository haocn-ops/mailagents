import test from "node:test";
import assert from "node:assert/strict";
import { createFetchApp } from "../src/fetch-app.js";
import { MemoryStore } from "../src/storage/memory-store.js";
import { createConfig } from "../src/config.js";

test("admin dashboard page is served on /admin", async () => {
  const cfg = createConfig({
    JWT_SECRET: "test-secret",
    BASE_CHAIN_ID: "84532",
    SIWE_MODE: "mock",
    PAYMENT_MODE: "mock",
  });
  const store = new MemoryStore({ chainId: cfg.baseChainId, challengeTtlMs: cfg.siweChallengeTtlMs });
  const app = createFetchApp({ config: cfg, store });

  const res = await app(new Request("http://localhost/admin", { method: "GET" }));
  assert.equal(res.status, 200);
  assert.match(String(res.headers.get("content-type")), /text\/html/);

  const html = await res.text();
  assert.ok(html.includes("Operations Control Plane"));
  assert.ok(html.includes("Run Auth + Allocate"));
});
