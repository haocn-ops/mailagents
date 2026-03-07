export class NoopMailBackend {
  async provisionMailbox({ address }) {
    return {
      providerRef: `noop:${address}`,
      credentials: {
        login: address,
        password: "noop-password",
        webmailUrl: "https://example.test/webmail/",
      },
    };
  }

  async issueMailboxCredentials({ address }) {
    return {
      login: address,
      password: "noop-password",
      webmailUrl: "https://example.test/webmail/",
    };
  }

  async releaseMailbox() {
    return { status: "released" };
  }

  async getMailbox(address) {
    return {
      found: true,
      address,
      enabled: true,
      backendStatus: "noop",
    };
  }

  async sendMailboxMessage({ address, to, subject, text, html }) {
    return {
      accepted: Array.isArray(to) ? to : [to],
      rejected: [],
      messageId: `noop:${address}:${Date.now()}`,
      envelope: {
        from: address,
        to: Array.isArray(to) ? to : [to],
      },
      preview: {
        subject,
        text: text || null,
        html: html || null,
      },
    };
  }
}
