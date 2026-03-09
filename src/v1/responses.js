export function createV1Responses({ jsonResponse }) {
  return {
    ok(requestId, payload) {
      return jsonResponse(200, payload, requestId);
    },

    okItems(requestId, items) {
      return jsonResponse(200, { items }, requestId);
    },

    okMessages(requestId, messages) {
      return jsonResponse(200, { messages }, requestId);
    },

    badRequest(requestId, message) {
      return jsonResponse(400, { error: "bad_request", message }, requestId);
    },

    forbidden(requestId, message) {
      return jsonResponse(403, { error: "forbidden", message }, requestId);
    },

    notFound(requestId, message) {
      return jsonResponse(404, { error: "not_found", message }, requestId);
    },

    conflict(requestId, error, message) {
      return jsonResponse(409, { error, message }, requestId);
    },

    mailBackendError(requestId, message) {
      return jsonResponse(502, { error: "mail_backend_error", message }, requestId);
    },
  };
}
