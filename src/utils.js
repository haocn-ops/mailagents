import { createHash, randomBytes, randomUUID } from "node:crypto";

export function json(res, statusCode, payload, requestId) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "x-request-id": requestId,
  });
  res.end(JSON.stringify(payload));
}

export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

export function createRequestId() {
  return randomUUID();
}

export function createNonce() {
  return randomBytes(12).toString("hex");
}

export function hashSecret(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function utcIsoNow() {
  return new Date().toISOString();
}

export function parseBearerToken(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7).trim();
}

export function parsePeriod(period) {
  const match = /^(\d{4})-(\d{2})$/.exec(period || "");
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0));
  return { start, end };
}

export function inTimeRange(dateLike, start, end) {
  const d = new Date(dateLike);
  return d >= start && d < end;
}

export function normalizeAddress(address) {
  return String(address || "").toLowerCase();
}
