export function createV1SystemRepository({ store }) {
  return {
    saveChallenge(walletAddress, nonce, message) {
      return store.saveChallenge(walletAddress, nonce, message);
    },

    getChallenge(walletAddress) {
      return store.getChallenge(walletAddress);
    },

    consumeChallenge(walletAddress) {
      return store.consumeChallenge(walletAddress);
    },

    getOrCreateIdentity(walletAddress) {
      return store.getOrCreateIdentity(walletAddress);
    },
  };
}
