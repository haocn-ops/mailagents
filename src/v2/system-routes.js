import { createJwt } from "../auth.js";
import { hashSecret } from "../utils.js";

export function createV2SystemRouteHandler({ store, runtimeConfig, jsonResponse, readJsonBody }) {
  return async function handleV2SystemRoute({ method, path, requestId, request }) {
    if (method === "POST" && path === "/v2/auth/temp-key") {
      if (runtimeConfig.tempKeyMode === "disabled") {
        return jsonResponse(404, { error: "not_found", message: "Route not found" }, requestId);
      }

      const body = await readJsonBody(request);
      const email = String(body.email || "").trim().toLowerCase();

      if (!email) {
        return jsonResponse(400, { error: "invalid_request", message: "email is required" }, requestId);
      }

      if (runtimeConfig.tempKeyMode === "allowlist") {
        const allowlist = runtimeConfig.tempKeyAllowlist || [];
        if (!allowlist.includes(email)) {
          return jsonResponse(403, { error: "forbidden", message: "email is not allowlisted" }, requestId);
        }
      }

      const addressSeed = hashSecret(email);
      const pseudoWallet = `0x${addressSeed.slice(0, 40)}`;
      const identity = await store.getOrCreateIdentity(pseudoWallet);

      const token = createJwt(
        {
          tenant_id: identity.tenantId,
          agent_id: identity.agentId,
          did: identity.did,
          scopes: ["mail:allocate", "mail:read", "mail:send", "webhook:write", "billing:read"],
          temp_key: true,
          temp_email: email,
        },
        runtimeConfig.jwtSecret,
        runtimeConfig.tempKeyTtlSeconds,
      );

      return jsonResponse(
        200,
        {
          access_token: token,
          token_type: "Bearer",
          expires_in: runtimeConfig.tempKeyTtlSeconds,
          did: identity.did,
          tenant_id: identity.tenantId,
          agent_id: identity.agentId,
          temp_key: true,
        },
        requestId,
      );
    }

    return null;
  };
}
