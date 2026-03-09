export function validateProductionReadiness(config) {
  const errors = [];
  const warnings = [];

  if (config.jwtSecret === "dev-jwt-secret") {
    errors.push("JWT_SECRET must be set to a non-default value");
  }
  if (!config.internalApiToken) {
    errors.push("INTERNAL_API_TOKEN is required");
  }
  if (!config.adminApiToken) {
    errors.push("ADMIN_API_TOKEN is required");
  }
  if (config.siweMode !== "strict") {
    errors.push("SIWE_MODE must be strict");
  }
  if (config.paymentMode !== "hmac") {
    errors.push("PAYMENT_MODE must be hmac");
  }
  if (!config.paymentHmacSecret) {
    errors.push("X402_HMAC_SECRET is required when PAYMENT_MODE=hmac");
  }
  if (config.mailProvider !== "mailu") {
    errors.push("MAIL_PROVIDER must be mailu");
  }
  if (!config.mailuBaseUrl) {
    errors.push("MAILU_BASE_URL is required");
  }
  if (!config.mailuApiToken) {
    errors.push("MAILU_API_TOKEN is required");
  }
  if (String(config.mailuBaseUrl || "").includes("mailu-dev") || String(config.mailuBaseUrl || "").includes("localhost")) {
    errors.push("MAILU_BASE_URL must not point to mailu-dev or localhost in production");
  }
  if (config.storageBackend !== "postgres") {
    errors.push("STORAGE_BACKEND must be postgres");
  }
  if (!config.databaseUrl) {
    errors.push("DATABASE_URL is required");
  }
  if (!config.webhookSecretEncryptionKey) {
    errors.push("WEBHOOK_SECRET_ENCRYPTION_KEY is required");
  }
  if (config.webhookSecretEncryptionKey === config.jwtSecret) {
    warnings.push("WEBHOOK_SECRET_ENCRYPTION_KEY should differ from JWT_SECRET");
  }
  if (config.webhookRetryAttempts < 2) {
    warnings.push("WEBHOOK_RETRY_ATTEMPTS should be at least 2");
  }
  if (config.webhookTimeoutMs < 1000) {
    warnings.push("WEBHOOK_TIMEOUT_MS is unusually low");
  }
  if (config.webhookRetryBackoffMs < 100) {
    warnings.push("WEBHOOK_RETRY_BACKOFF_MS is unusually low");
  }

  return { ok: errors.length === 0, errors, warnings };
}
