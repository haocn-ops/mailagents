function asLower(value, fallback) {
  return String(value ?? fallback).toLowerCase();
}

function asNumber(value, fallback) {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : Number(fallback);
}

export function createConfig(source = {}) {
  return {
    port: asNumber(source.PORT, 3000),
    jwtSecret: String(source.JWT_SECRET || "dev-jwt-secret"),
    baseChainId: asNumber(source.BASE_CHAIN_ID, 84532),
    storageBackend: asLower(source.STORAGE_BACKEND, "memory"),
    databaseUrl: String(source.DATABASE_URL || ""),
    siweMode: asLower(source.SIWE_MODE, "mock"),
    siweDomain: String(source.SIWE_DOMAIN || "localhost"),
    siweUri: String(source.SIWE_URI || "http://localhost"),
    siweStatement: String(source.SIWE_STATEMENT || "Sign in to Agent Mail Cloud"),
    siweChallengeTtlMs: asNumber(source.SIWE_CHALLENGE_TTL_MS, 5 * 60 * 1000),
    paymentMode: asLower(source.PAYMENT_MODE, "mock"),
    paymentHmacSecret: String(source.X402_HMAC_SECRET || ""),
    paymentHmacSkewSec: asNumber(source.X402_HMAC_SKEW_SEC, 300),
  };
}

export const config = createConfig(process.env);
