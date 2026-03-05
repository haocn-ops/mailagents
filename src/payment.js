import { createHmac, timingSafeEqual } from "node:crypto";

function fail(code, message) {
  return { ok: false, code, message };
}

function success() {
  return { ok: true };
}

function getHeader(req, name) {
  const key = String(name || "").toLowerCase();
  if (req?.headers?.get && typeof req.headers.get === "function") {
    return req.headers.get(key);
  }
  if (req?.headers && typeof req.headers === "object") {
    return req.headers[key] ?? req.headers[name];
  }
  return undefined;
}

function safeEqualHex(a, b) {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function hmacHex(secret, text) {
  return createHmac("sha256", secret).update(text).digest("hex");
}

function getPath(req) {
  if (!req?.url) return "";
  try {
    return new URL(req.url, "http://localhost").pathname;
  } catch {
    return String(req.url).split("?")[0];
  }
}

export function buildHmacPaymentProof({ secret, method, path, timestampSec }) {
  const payload = `${method}\n${path}\n${timestampSec}`;
  const signature = hmacHex(secret, payload);
  return `t=${timestampSec},v1=${signature}`;
}

export function createPaymentVerifier({ mode, hmacSecret, hmacSkewSec }) {
  if (mode === "hmac") {
    return {
      verify(req) {
        if (!hmacSecret) {
          return fail("payment_misconfigured", "x402 hmac secret is not configured");
        }

        const proofRaw = String(getHeader(req, "x-payment-proof") || "").trim();
        if (!proofRaw) {
          return fail("payment_required", "x402 payment proof is required for this endpoint");
        }

        const parts = Object.fromEntries(
          proofRaw.split(",").map((kv) => kv.trim().split("=")).filter((kv) => kv.length === 2),
        );

        const ts = Number(parts.t);
        const sig = String(parts.v1 || "");
        if (!Number.isInteger(ts) || !sig || !/^[0-9a-f]+$/i.test(sig)) {
          return fail("invalid_payment_proof", "payment proof format is invalid");
        }

        const nowSec = Math.floor(Date.now() / 1000);
        if (Math.abs(nowSec - ts) > hmacSkewSec) {
          return fail("invalid_payment_proof", "payment proof timestamp is expired");
        }

        const payload = `${req.method || "GET"}\n${getPath(req)}\n${ts}`;
        const expected = hmacHex(hmacSecret, payload);

        if (!safeEqualHex(sig, expected)) {
          return fail("invalid_payment_proof", "payment proof signature mismatch");
        }

        return success();
      },
    };
  }

  return {
    verify(req) {
      const proof = getHeader(req, "x-payment-proof");
      if (!proof) {
        return fail("payment_required", "x402 payment proof is required for this endpoint");
      }
      return success();
    },
  };
}
