import { randomUUID } from "node:crypto";

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function emptyResponse(status) {
  return new Response(null, { status });
}

function buildExpectedAuth(token, scheme = "BEARER") {
  if (!token) return "";
  return scheme === "RAW" ? token : `Bearer ${token}`;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDomain(value) {
  return String(value || "").trim().toLowerCase();
}

export function createMailuDevApp({
  apiToken = "change-me",
  authScheme = "BEARER",
  agentsBaseUrl = "http://localhost:3000",
  internalApiToken = "",
  fetchImpl = fetch,
} = {}) {
  const state = {
    domains: new Map(),
    users: new Map(),
  };

  function requireAuth(request) {
    const expected = buildExpectedAuth(apiToken, authScheme);
    if (!expected) return null;
    const actual = request.headers.get("authorization") || "";
    if (actual !== expected) {
      return jsonResponse(401, { error: "unauthorized", message: "invalid mailu api token" });
    }
    return null;
  }

  async function relayInboundEvent(body) {
    if (!internalApiToken) {
      throw new Error("INTERNAL_API_TOKEN is required for mailu-dev inbound relay");
    }
    const response = await fetchImpl(`${agentsBaseUrl.replace(/\/$/, "")}/internal/inbound/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${internalApiToken}`,
      },
      body: JSON.stringify(body),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const detail = payload?.message || payload?.error || `status ${response.status}`;
      const err = new Error(`mailagents inbound relay failed: ${detail}`);
      err.status = response.status;
      throw err;
    }

    return payload;
  }

  return async function app(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method || "GET";

    if (method === "GET" && path === "/healthz") {
      return jsonResponse(200, { status: "ok", service: "mailu-dev" });
    }

    const authError = requireAuth(request);
    if (authError) return authError;

    if (method === "GET" && path.startsWith("/api/v1/domain/")) {
      const domainName = normalizeDomain(decodeURIComponent(path.replace("/api/v1/domain/", "")));
      const domain = state.domains.get(domainName);
      if (!domain) {
        return jsonResponse(404, { error: "not_found", message: "domain not found" });
      }
      return jsonResponse(200, domain);
    }

    if (method === "POST" && path === "/api/v1/domain") {
      const body = await readJson(request);
      const domainName = normalizeDomain(body.name);
      if (!domainName) {
        return jsonResponse(400, { error: "bad_request", message: "name is required" });
      }
      const domain = {
        name: domainName,
        comment: String(body.comment || ""),
        max_users: Number(body.max_users ?? -1),
        max_aliases: Number(body.max_aliases ?? -1),
        max_quota_bytes: Number(body.max_quota_bytes ?? 0),
        signup_enabled: Boolean(body.signup_enabled),
      };
      state.domains.set(domainName, domain);
      return jsonResponse(200, domain);
    }

    if (method === "POST" && path === "/api/v1/user") {
      const body = await readJson(request);
      const email = normalizeEmail(body.email);
      if (!email) {
        return jsonResponse(400, { error: "bad_request", message: "email is required" });
      }
      if (state.users.has(email)) {
        return jsonResponse(409, { error: "conflict", message: "user exists" });
      }
      const domain = normalizeDomain(email.split("@")[1]);
      if (!state.domains.has(domain)) {
        return jsonResponse(404, { error: "not_found", message: "domain not found" });
      }
      const user = {
        email,
        enabled: body.enabled !== false,
        enable_imap: body.enable_imap !== false,
        enable_pop: Boolean(body.enable_pop),
        quota_bytes: Number(body.quota_bytes ?? 0),
        comment: String(body.comment || ""),
      };
      state.users.set(email, user);
      return jsonResponse(200, user);
    }

    if (method === "GET" && path.startsWith("/api/v1/user/")) {
      const email = normalizeEmail(decodeURIComponent(path.replace("/api/v1/user/", "")));
      const user = state.users.get(email);
      if (!user) {
        return jsonResponse(404, { error: "not_found", message: "user not found" });
      }
      return jsonResponse(200, user);
    }

    if (method === "PATCH" && path.startsWith("/api/v1/user/")) {
      const email = normalizeEmail(decodeURIComponent(path.replace("/api/v1/user/", "")));
      const user = state.users.get(email);
      if (!user) {
        return jsonResponse(404, { error: "not_found", message: "user not found" });
      }
      const body = await readJson(request);
      if (body.enabled !== undefined) user.enabled = Boolean(body.enabled);
      if (body.enable_imap !== undefined) user.enable_imap = Boolean(body.enable_imap);
      if (body.enable_pop !== undefined) user.enable_pop = Boolean(body.enable_pop);
      if (body.quota_bytes !== undefined) user.quota_bytes = Number(body.quota_bytes);
      if (body.comment !== undefined) user.comment = String(body.comment);
      state.users.set(email, user);
      return jsonResponse(200, user);
    }

    if (method === "DELETE" && path.startsWith("/api/v1/user/")) {
      const email = normalizeEmail(decodeURIComponent(path.replace("/api/v1/user/", "")));
      state.users.delete(email);
      return emptyResponse(200);
    }

    if (method === "POST" && path === "/_dev/inbound") {
      const body = await readJson(request);
      const address = normalizeEmail(body.address);
      if (!address) {
        return jsonResponse(400, { error: "bad_request", message: "address is required" });
      }
      const user = state.users.get(address);
      if (!user) {
        return jsonResponse(404, { error: "not_found", message: "user not found" });
      }
      if (!user.enabled) {
        return jsonResponse(409, { error: "mailbox_disabled", message: "mailbox is disabled" });
      }

      const providerMessageId = String(body.provider_message_id || `mailu-dev-${randomUUID()}`);
      const receivedAt = String(body.received_at || new Date().toISOString());
      const rawRef = String(body.raw_ref || `mailu://dev/${providerMessageId}`);

      const relay = await relayInboundEvent({
        address,
        provider_message_id: providerMessageId,
        sender: String(body.sender || "noreply@example.com"),
        sender_domain: String(body.sender_domain || "example.com"),
        subject: String(body.subject || "Your verification code"),
        received_at: receivedAt,
        raw_ref: rawRef,
        text_excerpt: body.text_excerpt ? String(body.text_excerpt) : "",
        html_excerpt: body.html_excerpt ? String(body.html_excerpt) : "",
        html_body: body.html_body ? String(body.html_body) : "",
        headers: body.headers && typeof body.headers === "object" ? body.headers : {},
      });

      return jsonResponse(202, {
        status: "accepted",
        provider_message_id: providerMessageId,
        raw_ref: rawRef,
        relay,
      });
    }

    return jsonResponse(404, { error: "not_found", message: "route not found" });
  };
}
