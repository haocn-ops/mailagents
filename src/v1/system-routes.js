import { createJwt } from "../auth.js";
import { buildHmacPaymentProof } from "../payment.js";
import { createNonce } from "../utils.js";

export function createV1SystemRouteHandler({
  store,
  runtimeConfig,
  siweService,
  requireAuth,
  jsonResponse,
  readJsonBody,
  paidBypassTargets,
  getOverageChargeUsdc,
}) {
  return async function handleV1SystemRoute({ method, path, request, requestId }) {
    if (!path.startsWith("/v1/")) return null;

    if (method === "POST" && path === "/v1/payments/proof") {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const body = await readJsonBody(request);
      const proofMethod = String(body.method || "").trim().toUpperCase();
      const proofPath = String(body.path || "").trim();
      if (!proofMethod || !proofPath) {
        return jsonResponse(400, { error: "bad_request", message: "method and path are required" }, requestId);
      }

      if (!paidBypassTargets.has(`${proofMethod} ${proofPath}`)) {
        return jsonResponse(400, { error: "bad_request", message: "unsupported payment proof target" }, requestId);
      }

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

      return jsonResponse(
        200,
        {
          x_payment_proof: proof,
          method: proofMethod,
          path: proofPath,
          amount_usdc: getOverageChargeUsdc(),
          expires_at: new Date((nowSec + runtimeConfig.paymentHmacSkewSec) * 1000).toISOString(),
        },
        requestId,
      );
    }

    if (method === "POST" && path === "/v1/auth/siwe/challenge") {
      const body = await readJsonBody(request);
      const walletAddress = String(body.wallet_address || "").trim();
      if (!walletAddress) {
        return jsonResponse(400, { error: "bad_request", message: "wallet_address is required" }, requestId);
      }

      const nonce = createNonce();
      let message;
      try {
        message = await siweService.createChallengeMessage(walletAddress, nonce);
      } catch (err) {
        if (err.code === "INVALID_SIWE_MESSAGE") {
          return jsonResponse(400, { error: "bad_request", message: err.message }, requestId);
        }
        throw err;
      }
      await store.saveChallenge(walletAddress, nonce, message);

      return jsonResponse(200, { nonce, message }, requestId);
    }

    if (method === "POST" && path === "/v1/auth/siwe/verify") {
      const body = await readJsonBody(request);
      const message = String(body.message || "");
      const signature = String(body.signature || "");
      if (!message || !signature) {
        return jsonResponse(400, { error: "bad_request", message: "message and signature are required" }, requestId);
      }

      let parsed;
      try {
        parsed = await siweService.parseMessage(message);
      } catch (err) {
        if (err.code === "INVALID_SIWE_MESSAGE") {
          return jsonResponse(400, { error: "bad_request", message: err.message }, requestId);
        }
        throw err;
      }

      const walletAddress = parsed.address;
      const nonce = parsed.nonce;
      const challenge = await store.getChallenge(walletAddress);

      if (!challenge || challenge.nonce !== nonce || challenge.message !== message) {
        return jsonResponse(401, { error: "unauthorized", message: "challenge mismatch or expired" }, requestId);
      }

      const verified = await siweService.verifySignature({
        message,
        signature,
        expectedAddress: walletAddress,
        expectedNonce: nonce,
      });

      if (!verified.ok) {
        return jsonResponse(401, { error: "unauthorized", message: verified.message || "invalid signature" }, requestId);
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

      return jsonResponse(
        200,
        {
          access_token: token,
          token_type: "Bearer",
          expires_in: 3600,
          did: identity.did,
          tenant_id: identity.tenantId,
          agent_id: identity.agentId,
        },
        requestId,
      );
    }

    return null;
  };
}
