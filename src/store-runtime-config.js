export function buildStoreConfig(runtimeConfig) {
  return {
    chainId: runtimeConfig.baseChainId,
    challengeTtlMs: runtimeConfig.siweChallengeTtlMs,
    mailboxDomain: runtimeConfig.mailboxDomain,
    webhookSecretEncryptionKey: runtimeConfig.webhookSecretEncryptionKey,
  };
}

export function buildPostgresStoreConfig(runtimeConfig) {
  return {
    ...buildStoreConfig(runtimeConfig),
    databaseUrl: runtimeConfig.databaseUrl,
  };
}
