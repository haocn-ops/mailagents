import { createWorkerRuntime } from "./worker-runtime.js";

const runtime = createWorkerRuntime();

export default {
  async fetch(request, env) {
    const cachedHandler = await runtime.getHandler(env);
    return cachedHandler(request);
  },
};
