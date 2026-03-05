import { config } from "./config.js";
import { MemoryStore } from "./storage/memory-store.js";
import { PostgresStore } from "./storage/postgres-store.js";

const memoryStore = new MemoryStore({
  chainId: config.baseChainId,
  challengeTtlMs: config.siweChallengeTtlMs,
});

const defaultStore =
  config.storageBackend === "postgres"
    ? new PostgresStore({
        databaseUrl: config.databaseUrl,
        chainId: config.baseChainId,
        challengeTtlMs: config.siweChallengeTtlMs,
      })
    : memoryStore;

export function getDefaultStore() {
  return defaultStore;
}

export function getStateForTests() {
  if (typeof memoryStore.getStateForTests === "function") {
    return memoryStore.getStateForTests();
  }
  return null;
}
