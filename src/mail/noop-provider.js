export class NoopMailProvider {
  async provisionMailbox({ address }) {
    return {
      providerRef: `noop:${address}`,
    };
  }

  async releaseMailbox() {
    return { status: "released" };
  }
}
