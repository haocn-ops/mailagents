import test from "node:test";
import assert from "node:assert/strict";
import { validateProductionReadiness } from "../src/preflight.js";
import { evaluateStartupPreflight, shouldEnforceStartupPreflight } from "../src/startup-policy.js";

test("production preflight rejects unsafe defaults", () => {
  const result = validateProductionReadiness({
    jwtSecret: "dev-jwt-secret",
    internalApiToken: "",
    adminApiToken: "",
    siweMode: "mock",
    paymentMode: "mock",
    paymentHmacSecret: "",
    mailProvider: "noop",
    mailuBaseUrl: "http://localhost:3001",
    mailuApiToken: "",
    storageBackend: "memory",
    databaseUrl: "",
    webhookSecretEncryptionKey: "",
    webhookRetryAttempts: 1,
    webhookTimeoutMs: 500,
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.includes("JWT_SECRET")));
  assert.ok(result.errors.some((item) => item.includes("ADMIN_API_TOKEN")));
  assert.ok(result.errors.some((item) => item.includes("MAIL_PROVIDER")));
});

test("production preflight accepts hardened config", () => {
  const result = validateProductionReadiness({
    jwtSecret: "jwt-secret-prod",
    internalApiToken: "internal-prod",
    adminApiToken: "admin-prod",
    siweMode: "strict",
    paymentMode: "hmac",
    paymentHmacSecret: "pay-secret",
    mailProvider: "mailu",
    mailuBaseUrl: "https://mailu.internal.example.com",
    mailuApiToken: "mailu-token",
    storageBackend: "postgres",
    databaseUrl: "postgres://user:pass@db/prod",
    webhookSecretEncryptionKey: "webhook-key",
    webhookRetryAttempts: 3,
    webhookTimeoutMs: 5000,
  });

  assert.equal(result.ok, true);
});

test("startup policy enforcement respects explicit and production env flags", () => {
  assert.equal(shouldEnforceStartupPreflight({ REQUIRE_PROD_PREFLIGHT: "true" }), true);
  assert.equal(
    shouldEnforceStartupPreflight({ NODE_ENV: "production", ENFORCE_SAFE_STARTUP: "true" }),
    true,
  );
  assert.equal(
    shouldEnforceStartupPreflight({ NODE_ENV: "production", ENFORCE_SAFE_STARTUP: "false" }),
    false,
  );
  assert.equal(shouldEnforceStartupPreflight({ NODE_ENV: "development" }), false);
});

test("startup policy evaluation throws enriched preflight error for unsafe config", () => {
  assert.throws(
    () =>
      evaluateStartupPreflight({
        jwtSecret: "dev-jwt-secret",
        internalApiToken: "",
        adminApiToken: "",
        siweMode: "mock",
        paymentMode: "mock",
        paymentHmacSecret: "",
        mailProvider: "noop",
        mailuBaseUrl: "http://localhost:3001",
        mailuApiToken: "",
        storageBackend: "memory",
        databaseUrl: "",
        webhookSecretEncryptionKey: "",
        webhookRetryAttempts: 1,
        webhookTimeoutMs: 500,
        webhookRetryBackoffMs: 50,
      }),
    (err) => err?.code === "PROD_PREFLIGHT_FAILED" && Array.isArray(err?.details?.errors),
  );
});
