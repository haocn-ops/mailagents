import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_EXP_SECONDS = 3600;

function base64UrlEncode(raw) {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(raw) {
  const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4);
  const normalized = padded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function sign(input, secret) {
  return createHmac("sha256", secret)
    .update(input)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function createJwt(payload, secret, expiresIn = DEFAULT_EXP_SECONDS) {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const body = { ...payload, iat: nowSec, exp: nowSec + expiresIn };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedBody = base64UrlEncode(JSON.stringify(body));
  const signingInput = `${encodedHeader}.${encodedBody}`;
  const signature = sign(signingInput, secret);
  return `${signingInput}.${signature}`;
}

export function verifyJwt(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token");
  }

  const [encodedHeader, encodedBody, signature] = parts;
  const signingInput = `${encodedHeader}.${encodedBody}`;
  const expected = sign(signingInput, secret);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid signature");
  }

  const payload = JSON.parse(base64UrlDecode(encodedBody));
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSec) {
    throw new Error("Token expired");
  }
  return payload;
}
