import { MailuInternalAdapter } from "./mailu-internal-adapter.js";
import { NoopMailBackend } from "./noop-backend.js";

export function createMailBackendAdapter(runtimeConfig) {
  if (runtimeConfig.mailProvider === "mailu") {
    return new MailuInternalAdapter({
      mailboxDomain: runtimeConfig.mailboxDomain,
      baseUrl: runtimeConfig.mailuBaseUrl,
      apiToken: runtimeConfig.mailuApiToken,
      releaseMode: runtimeConfig.mailuReleaseMode,
      quotaBytes: runtimeConfig.mailuQuotaBytes,
      authScheme: runtimeConfig.mailuAuthScheme,
      smtpHost: runtimeConfig.mailSmtpHost,
      smtpPort: runtimeConfig.mailSmtpPort,
      smtpSecure: runtimeConfig.mailSmtpSecure,
    });
  }

  return new NoopMailBackend();
}
