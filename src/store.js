import { config } from "./config.js";
import { MemoryStore } from "./storage/memory-store.js";
import { PostgresStore } from "./storage/postgres-store.js";

export function createStoreFromConfig(runtimeConfig) {
  if (runtimeConfig.storageBackend === "postgres") {
    return new PostgresStore({
      databaseUrl: runtimeConfig.databaseUrl,
      chainId: runtimeConfig.baseChainId,
      challengeTtlMs: runtimeConfig.siweChallengeTtlMs,
      mailboxDomain: runtimeConfig.mailboxDomain,
    });
  }

  return new MemoryStore({
    chainId: runtimeConfig.baseChainId,
    challengeTtlMs: runtimeConfig.siweChallengeTtlMs,
    mailboxDomain: runtimeConfig.mailboxDomain,
  });
}

const defaultStore = createStoreFromConfig(config);

export function getDefaultStore() {
  return defaultStore;
}

export function getStateForTests() {
  if (typeof defaultStore.getStateForTests === "function") {
    return defaultStore.getStateForTests();
  }
  return null;
}
