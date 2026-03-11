export function buildAuthHeader(token, scheme = "BEARER") {
  if (!token) return "";
  if (token.startsWith("Bearer ") || token.startsWith("Token ")) {
    return token;
  }
  return scheme === "RAW" ? token : `Bearer ${token}`;
}

export async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function requestJson(url, {
  method = "GET",
  headers = {},
  body,
  expectedStatuses = [200],
  fetchImpl = fetch,
} = {}) {
  const upperMethod = String(method || "GET").toUpperCase();
  const shouldSendBody = body !== undefined && body !== null && upperMethod !== "GET" && upperMethod !== "HEAD";
  const response = await fetchImpl(url, {
    method,
    headers,
    body: shouldSendBody ? JSON.stringify(body) : undefined,
  });

  if (!expectedStatuses.includes(response.status)) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload?.message || JSON.stringify(payload);
    } catch {
      detail = await response.text();
    }
    const err = new Error(`${method} ${url} failed with ${response.status}${detail ? `: ${detail}` : ""}`);
    err.status = response.status;
    throw err;
  }

  if (response.status === 204) return null;
  return readJsonResponse(response);
}
