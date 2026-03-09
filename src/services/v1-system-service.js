import { createJwt } from "../auth.js";
import { buildHmacPaymentProof } from "../payment.js";
import { createNonce } from "../utils.js";

export function createV1SystemService({ store, runtimeConfig, siweService, getOverageChargeUsdc }) {
  return {
    createPaymentProof({ proofMethod, proofPath }) {
      const nowSec = Math.floor(Date.now() / 1000);
      const proof =
        runtimeConfig.paymentMode === "hmac"
          ? buildHmacPaymentProof({
              secret: runtimeConfig.paymentHmacSecret,
              method: proofMethod,
              path: proofPath,
              timestampSec: nowSec,
            })
          : "mock-proof";

      return {
        x_payment_proof: proof,
        method: proofMethod,
        path: proofPath,
        amount_usdc: getOverageChargeUsdc(),
        expires_at: new Date((nowSec + runtimeConfig.paymentHmacSkewSec) * 1000).toISOString(),
      };
    },

    async createSiweChallenge(walletAddress) {
      const nonce = createNonce();
      const message = await siweService.createChallengeMessage(walletAddress, nonce);
      await store.saveChallenge(walletAddress, nonce, message);
      return { nonce, message };
    },

    async verifySiwe({ message, signature }) {
      const parsed = await siweService.parseMessage(message);
      const walletAddress = parsed.address;
      const nonce = parsed.nonce;
      const challenge = await store.getChallenge(walletAddress);

      if (!challenge || challenge.nonce !== nonce || challenge.message !== message) {
        return { ok: false, code: "CHALLENGE_MISMATCH", message: "challenge mismatch or expired" };
      }

      const verified = await siweService.verifySignature({
        message,
        signature,
        expectedAddress: walletAddress,
        expectedNonce: nonce,
      });
      if (!verified.ok) {
        return { ok: false, code: "INVALID_SIGNATURE", message: verified.message || "invalid signature" };
      }

      await store.consumeChallenge(walletAddress);
      const identity = await store.getOrCreateIdentity(walletAddress);
      const token = createJwt(
        {
          tenant_id: identity.tenantId,
          agent_id: identity.agentId,
          did: identity.did,
          scopes: ["mail:allocate", "mail:read", "mail:send", "webhook:write", "billing:read"],
        },
        runtimeConfig.jwtSecret,
        3600,
      );

      return {
        ok: true,
        payload: {
          access_token: token,
          token_type: "Bearer",
          expires_in: 3600,
          did: identity.did,
          tenant_id: identity.tenantId,
          agent_id: identity.agentId,
        },
      };
    },
  };
}
