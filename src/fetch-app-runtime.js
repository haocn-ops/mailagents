import { createRequestId } from "./utils.js";

export function createRequestContext(request) {
  const requestUrl = new URL(request.url);
  return {
    request,
    requestId: createRequestId(),
    method: request.method || "GET",
    requestUrl,
    path: requestUrl.pathname,
  };
}

export function handleFetchAppError(err, { jsonResponse, requestId, isProduction }) {
  if (err.message === "Invalid JSON") {
    return jsonResponse(400, { error: "bad_request", message: err.message }, requestId);
  }
  if (err.message === "Payload too large") {
    return jsonResponse(413, { error: "payload_too_large", message: err.message }, requestId);
  }
  if (err.code === "SIWE_UNAVAILABLE") {
    return jsonResponse(500, { error: "siwe_unavailable", message: err.message }, requestId);
  }

  return jsonResponse(
    500,
    {
      error: "internal_error",
      message: "Unexpected server error",
      detail: isProduction ? undefined : err.message,
    },
    requestId,
  );
}
