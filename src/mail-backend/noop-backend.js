export class NoopMailBackend {
  async provisionMailbox({ address }) {
    return {
      providerRef: `noop:${address}`,
    };
  }

  async releaseMailbox() {
    return { status: "released" };
  }
}
