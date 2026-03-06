export class NoopMailBackend {
  async provisionMailbox({ address }) {
    return {
      providerRef: `noop:${address}`,
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
}
