import { createV1SystemService } from "../services/v1-system-service.js";

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
  const systemService = createV1SystemService({
    store,
    runtimeConfig,
    siweService,
    getOverageChargeUsdc,
  });

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

      return jsonResponse(200, systemService.createPaymentProof({ proofMethod, proofPath }), requestId);
    }

    if (method === "POST" && path === "/v1/auth/siwe/challenge") {
      const body = await readJsonBody(request);
      const walletAddress = String(body.wallet_address || "").trim();
      if (!walletAddress) {
        return jsonResponse(400, { error: "bad_request", message: "wallet_address is required" }, requestId);
      }

      try {
        const challenge = await systemService.createSiweChallenge(walletAddress);
        return jsonResponse(200, challenge, requestId);
      } catch (err) {
        if (err.code === "INVALID_SIWE_MESSAGE") {
          return jsonResponse(400, { error: "bad_request", message: err.message }, requestId);
        }
        throw err;
      }
    }

    if (method === "POST" && path === "/v1/auth/siwe/verify") {
      const body = await readJsonBody(request);
      const message = String(body.message || "");
      const signature = String(body.signature || "");
      if (!message || !signature) {
        return jsonResponse(400, { error: "bad_request", message: "message and signature are required" }, requestId);
      }

      try {
        const result = await systemService.verifySiwe({ message, signature });
        if (!result.ok) {
          return jsonResponse(401, { error: "unauthorized", message: result.message }, requestId);
        }
        return jsonResponse(200, result.payload, requestId);
      } catch (err) {
        if (err.code === "INVALID_SIWE_MESSAGE") {
          return jsonResponse(400, { error: "bad_request", message: err.message }, requestId);
        }
        throw err;
      }
    }

    return null;
  };
}
