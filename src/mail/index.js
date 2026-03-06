import { MailuProvider } from "./mailu-provider.js";
import { NoopMailProvider } from "./noop-provider.js";

export function createMailProvider(runtimeConfig) {
  if (runtimeConfig.mailProvider === "mailu") {
    return new MailuProvider({
      mailboxDomain: runtimeConfig.mailboxDomain,
      baseUrl: runtimeConfig.mailuBaseUrl,
      apiToken: runtimeConfig.mailuApiToken,
      releaseMode: runtimeConfig.mailuReleaseMode,
      quotaBytes: runtimeConfig.mailuQuotaBytes,
      authScheme: runtimeConfig.mailuAuthScheme,
    });
  }

  return new NoopMailProvider();
}
