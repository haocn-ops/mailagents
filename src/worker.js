import { createConfig } from "./config.js";
import { createFetchApp } from "./fetch-app.js";
import { runStartupPreflight } from "./bootstrap.js";
import { createStoreFromConfig } from "./store.js";

function buildRuntimeConfig(env) {
  return createConfig(env || {});
}

let cachedHandler = null;
let cachedConfigKey = "";
let cachedPreflightKey = "";

function configKeyFrom(config) {
  return JSON.stringify({
    storageBackend: config.storageBackend,
    databaseUrl: config.databaseUrl,
    baseChainId: config.baseChainId,
    siweMode: config.siweMode,
    siweDomain: config.siweDomain,
    siweUri: config.siweUri,
    siweStatement: config.siweStatement,
    siweChallengeTtlMs: config.siweChallengeTtlMs,
    paymentMode: config.paymentMode,
    paymentHmacSecret: config.paymentHmacSecret,
    paymentHmacSkewSec: config.paymentHmacSkewSec,
    jwtSecret: config.jwtSecret,
  });
}

export default {
  async fetch(request, env) {
    const runtimeConfig = buildRuntimeConfig(env);
    const key = configKeyFrom(runtimeConfig);

    if (cachedPreflightKey !== key) {
      runStartupPreflight(runtimeConfig, env);
      cachedPreflightKey = key;
    }

    if (!cachedHandler || cachedConfigKey !== key) {
      const store = createStoreFromConfig(runtimeConfig);
      cachedHandler = createFetchApp({ config: runtimeConfig, store });
      cachedConfigKey = key;
    }

    return cachedHandler(request);
  },
};
