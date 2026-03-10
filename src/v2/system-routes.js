import { createV1SystemService } from "../services/v1-system-service.js";
import { createV2SystemResponses } from "./system-responses.js";
import { parsePaymentProofBody, parseSiweChallengeBody, parseSiweVerifyBody } from "./system-validation.js";

export function createV2SystemRouteHandler({
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
  const responses = createV2SystemResponses({ jsonResponse });

  return async function handleV2SystemRoute({ method, path, request, requestId }) {
    if (!path.startsWith("/v2/")) return null;

    if (method === "POST" && path === "/v2/payments/proof") {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const body = await readJsonBody(request);
      const parsed = parsePaymentProofBody(body, paidBypassTargets);
      if (!parsed.ok) {
        return responses.badRequest(requestId, parsed.message);
      }

      return responses.ok(
        requestId,
        systemService.createPaymentProof({ proofMethod: parsed.proofMethod, proofPath: parsed.proofPath }),
      );
    }

    if (method === "POST" && path === "/v2/auth/siwe/challenge") {
      const body = await readJsonBody(request);
      const parsed = parseSiweChallengeBody(body);
      if (!parsed.ok) {
        return responses.badRequest(requestId, parsed.message);
      }

      try {
        const challenge = await systemService.createSiweChallenge(parsed.walletAddress);
        return responses.ok(requestId, challenge);
      } catch (err) {
        if (err.code === "INVALID_SIWE_MESSAGE") {
          return responses.badRequest(requestId, err.message);
        }
        throw err;
      }
    }

    if (method === "POST" && path === "/v2/auth/siwe/verify") {
      const body = await readJsonBody(request);
      const parsed = parseSiweVerifyBody(body);
      if (!parsed.ok) {
        return responses.badRequest(requestId, parsed.message);
      }

      try {
        const result = await systemService.verifySiwe({ message: parsed.message, signature: parsed.signature });
        if (!result.ok) {
          return responses.unauthorized(requestId, result.message);
        }
        return responses.ok(requestId, result.payload);
      } catch (err) {
        if (err.code === "INVALID_SIWE_MESSAGE") {
          return responses.badRequest(requestId, err.message);
        }
        throw err;
      }
    }

    return null;
  };
}
