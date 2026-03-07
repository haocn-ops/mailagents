function asLower(value, fallback) {
  return String(value ?? fallback).toLowerCase();
}

function asNumber(value, fallback) {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : Number(fallback);
}

function asUpper(value, fallback) {
  return String(value ?? fallback).toUpperCase();
}

export function createConfig(source = {}) {
  const baseChainId = asNumber(source.BASE_CHAIN_ID, 84532);
  const defaultChainName = baseChainId === 84532 ? "Base Sepolia" : `chain ${baseChainId}`;
  const defaultRpcUrls = baseChainId === 84532 ? ["https://sepolia.base.org"] : [];
  const defaultExplorerUrls = baseChainId === 84532 ? ["https://sepolia.basescan.org"] : [];

  return {
    port: asNumber(source.PORT, 3000),
    jwtSecret: String(source.JWT_SECRET || "dev-jwt-secret"),
    adminApiToken: String(source.ADMIN_API_TOKEN || ""),
    internalApiToken: String(source.INTERNAL_API_TOKEN || ""),
    baseChainId,
    chainName: String(source.CHAIN_NAME || defaultChainName),
    chainRpcUrls: String(source.CHAIN_RPC_URLS || defaultRpcUrls.join(","))
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    chainExplorerUrls: String(source.CHAIN_EXPLORER_URLS || defaultExplorerUrls.join(","))
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    mailboxDomain: String(source.MAILBOX_DOMAIN || "pool.mailcloud.local"),
    mailProvider: asLower(source.MAIL_PROVIDER, "noop"),
    storageBackend: asLower(source.STORAGE_BACKEND, "memory"),
    databaseUrl: String(source.DATABASE_URL || ""),
    mailuBaseUrl: String(source.MAILU_BASE_URL || ""),
    mailuApiToken: String(source.MAILU_API_TOKEN || ""),
    mailuReleaseMode: asLower(source.MAILU_RELEASE_MODE, "disable"),
    mailuQuotaBytes: asNumber(source.MAILU_QUOTA_BYTES, 1024 * 1024 * 1024),
    mailuAuthScheme: asUpper(source.MAILU_AUTH_SCHEME, "BEARER"),
    siweMode: asLower(source.SIWE_MODE, "mock"),
    siweDomain: String(source.SIWE_DOMAIN || "localhost"),
    siweUri: String(source.SIWE_URI || "http://localhost"),
    siweStatement: String(source.SIWE_STATEMENT || "Sign in to Agent Mail Cloud"),
    siweChallengeTtlMs: asNumber(source.SIWE_CHALLENGE_TTL_MS, 5 * 60 * 1000),
    paymentMode: asLower(source.PAYMENT_MODE, "mock"),
    paymentHmacSecret: String(source.X402_HMAC_SECRET || ""),
    paymentHmacSkewSec: asNumber(source.X402_HMAC_SKEW_SEC, 300),
    webhookSecretEncryptionKey: String(source.WEBHOOK_SECRET_ENCRYPTION_KEY || source.JWT_SECRET || "dev-jwt-secret"),
    webhookTimeoutMs: asNumber(source.WEBHOOK_TIMEOUT_MS, 5000),
    webhookRetryAttempts: asNumber(source.WEBHOOK_RETRY_ATTEMPTS, 3),
  };
}

export const config = createConfig(process.env);
