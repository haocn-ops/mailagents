import { config } from "./config.js";
import { MemoryStore } from "./storage/memory-store.js";
import { PostgresStore } from "./storage/postgres-store.js";
import { buildPostgresStoreConfig, buildStoreConfig } from "./store-runtime-config.js";

export function createStoreFromConfig(runtimeConfig) {
  if (runtimeConfig.storageBackend === "postgres") {
    return new PostgresStore(buildPostgresStoreConfig(runtimeConfig));
  }

  return new MemoryStore(buildStoreConfig(runtimeConfig));
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
