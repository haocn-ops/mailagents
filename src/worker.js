import { createConfig } from "./config.js";
import { createFetchApp } from "./fetch-app.js";
import { createStoreFromConfig } from "./store.js";

function buildRuntimeConfig(env) {
  return createConfig(env || {});
}

export default {
  async fetch(request, env) {
    const runtimeConfig = buildRuntimeConfig(env);
    const store = createStoreFromConfig(runtimeConfig);
    const handler = createFetchApp({ config: runtimeConfig, store });
    return handler(request);
  },
};
