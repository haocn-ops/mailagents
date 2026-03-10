export function createV2SystemResponses({ jsonResponse }) {
  return {
    ok(requestId, payload) {
      return jsonResponse(200, payload, requestId);
    },

    badRequest(requestId, message) {
      return jsonResponse(400, { error: "bad_request", message }, requestId);
    },

    unauthorized(requestId, message) {
      return jsonResponse(401, { error: "unauthorized", message }, requestId);
    },
  };
}
