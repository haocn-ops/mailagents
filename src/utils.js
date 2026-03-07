import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { getAddress } from "ethers";

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

function deriveKey(secret) {
  return createHash("sha256").update(String(secret || "")).digest();
}

export function encryptSecret(value, keyMaterial) {
  const iv = randomBytes(12);
  const key = deriveKey(keyMaterial);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptSecret(payload, keyMaterial) {
  const [ivB64, tagB64, dataB64] = String(payload || "").split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted secret payload");
  }
  const key = deriveKey(keyMaterial);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}

export function signHmacSha256(secret, payload) {
  return createHmac("sha256", String(secret || "")).update(String(payload || "")).digest("hex");
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

export function checksumAddress(address) {
  return getAddress(String(address || "").trim().toLowerCase());
}
