export function createInternalResponses({ jsonResponse }) {
  return {
    ok(requestId, payload) {
      return jsonResponse(200, payload, requestId);
    },

    accepted(requestId, payload) {
      return jsonResponse(202, payload, requestId);
    },

    badRequest(requestId, message) {
      return jsonResponse(400, { error: "bad_request", message }, requestId);
    },

    notFound(requestId, message) {
      return jsonResponse(404, { error: "not_found", message }, requestId);
    },
  };
}
