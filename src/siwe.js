function invalid(reason) {
  const err = new Error(reason);
  err.code = "INVALID_SIWE_MESSAGE";
  throw err;
}

function unavailable(reason) {
  const err = new Error(reason);
  err.code = "SIWE_UNAVAILABLE";
  throw err;
}

async function loadSiwe() {
  try {
    const mod = await import("siwe");
    return mod.default || mod;
  } catch {
    unavailable("SIWE strict mode requires package 'siwe'. Run: npm install siwe");
  }
}

function parseMockMessage(message) {
  const text = String(message || "");
  const addressMatch = text.match(/^address:(.+)$/m);
  const nonceMatch = text.match(/^nonce:(.+)$/m);

  if (!addressMatch || !nonceMatch) {
    invalid("invalid message format");
  }

  return {
    address: addressMatch[1].trim().toLowerCase(),
    nonce: nonceMatch[1].trim(),
  };
}

export function createSiweService({ mode, chainId, domain, uri, statement }) {
  const normalizedMode = String(mode || "mock").toLowerCase();

  return {
    async createChallengeMessage(walletAddress, nonce) {
      const rawAddress = String(walletAddress || "").trim();
      const normalizedAddress = rawAddress.toLowerCase();

      if (normalizedMode !== "strict") {
        return [
          "Agent Mail Cloud SIWE Challenge",
          `address:${normalizedAddress}`,
          `chain_id:${chainId}`,
          `nonce:${nonce}`,
        ].join("\n");
      }

      const siwe = await loadSiwe();
      const SiweMessage = siwe.SiweMessage || siwe;
      const message = new SiweMessage({
        domain,
        address: rawAddress,
        statement,
        uri,
        version: "1",
        chainId,
        nonce,
        issuedAt: new Date().toISOString(),
      });

      return message.prepareMessage();
    },

    async parseMessage(message) {
      if (normalizedMode !== "strict") {
        return parseMockMessage(message);
      }

      const siwe = await loadSiwe();
      const SiweMessage = siwe.SiweMessage || siwe;

      try {
        const parsed = new SiweMessage(String(message || ""));
        return {
          address: String(parsed.address || "").toLowerCase(),
          nonce: String(parsed.nonce || ""),
          chainId: Number(parsed.chainId),
          domain: parsed.domain,
          uri: parsed.uri,
        };
      } catch {
        invalid("invalid SIWE message");
      }
    },

    async verifySignature({ message, signature, expectedAddress, expectedNonce }) {
      if (normalizedMode !== "strict") {
        if (!signature) {
          return { ok: false, message: "signature is required" };
        }

        const parsed = parseMockMessage(message);
        if (parsed.address !== String(expectedAddress || "").toLowerCase()) {
          return { ok: false, message: "wallet mismatch" };
        }
        if (parsed.nonce !== String(expectedNonce || "")) {
          return { ok: false, message: "nonce mismatch" };
        }
        return { ok: true };
      }

      const siwe = await loadSiwe();
      const SiweMessage = siwe.SiweMessage || siwe;

      try {
        const siweMessage = new SiweMessage(String(message || ""));
        const result = await siweMessage.verify({
          signature,
          domain,
          nonce: expectedNonce,
          time: new Date().toISOString(),
        });

        if (!result?.success) {
          return { ok: false, message: "invalid SIWE signature" };
        }

        if (String(siweMessage.address || "").toLowerCase() !== String(expectedAddress || "").toLowerCase()) {
          return { ok: false, message: "wallet mismatch" };
        }
        if (Number(siweMessage.chainId) !== Number(chainId)) {
          return { ok: false, message: "chain_id mismatch" };
        }

        return { ok: true };
      } catch {
        return { ok: false, message: "invalid SIWE signature" };
      }
    },
  };
}
