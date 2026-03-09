import { MailuInternalAdapter } from "./mailu-internal-adapter.js";
import { NoopMailBackend } from "./noop-backend.js";
import { buildMailuAdapterConfig } from "./runtime-config.js";

export function createMailBackendAdapter(runtimeConfig) {
  if (runtimeConfig.mailProvider === "mailu") {
    return new MailuInternalAdapter(buildMailuAdapterConfig(runtimeConfig));
  }

  return new NoopMailBackend();
}
