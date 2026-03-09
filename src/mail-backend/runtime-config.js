export function buildMailuAdapterConfig(runtimeConfig) {
  return {
    mailboxDomain: runtimeConfig.mailboxDomain,
    baseUrl: runtimeConfig.mailuBaseUrl,
    apiToken: runtimeConfig.mailuApiToken,
    releaseMode: runtimeConfig.mailuReleaseMode,
    quotaBytes: runtimeConfig.mailuQuotaBytes,
    authScheme: runtimeConfig.mailuAuthScheme,
    smtpHost: runtimeConfig.mailSmtpHost,
    smtpPort: runtimeConfig.mailSmtpPort,
    smtpSecure: runtimeConfig.mailSmtpSecure,
  };
}
