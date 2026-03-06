import test from "node:test";
import assert from "node:assert/strict";
import { validateProductionReadiness } from "../src/preflight.js";

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
