export function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function emptyResponse(status) {
  return new Response(null, { status });
}

export function buildExpectedAuth(token, scheme = "BEARER") {
  if (!token) return "";
  return scheme === "RAW" ? token : `Bearer ${token}`;
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
