import { randomUUID } from "node:crypto";
import { decryptSecret, signHmacSha256 } from "./utils.js";

function timeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }
  return undefined;
}

function sleep(ms) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createWebhookDispatcher({
  secretEncryptionKey,
  timeoutMs = 5000,
  retryAttempts = 3,
  retryBackoffMs = 250,
} = {}) {
  return {
    async dispatch({ webhook, payload }) {
      const body = JSON.stringify(payload);
      const deliveryId = randomUUID();
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const secret =
        webhook.secretEnc && secretEncryptionKey ? decryptSecret(webhook.secretEnc, secretEncryptionKey) : null;

      let lastStatusCode = 502;
      let lastErrorMessage = null;
      let lastResponseExcerpt = null;
      for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
        try {
          const headers = {
            "content-type": "application/json",
            "x-agent-mail-delivery-id": deliveryId,
            "x-agent-mail-attempt": String(attempt),
            "x-agent-mail-timestamp": timestamp,
          };
          if (secret) {
            headers["x-agent-mail-signature"] = `t=${timestamp},v1=${signHmacSha256(secret, `${timestamp}.${body}`)}`;
          }

          const response = await fetch(webhook.targetUrl, {
            method: "POST",
            headers,
            body,
            signal: timeoutSignal(timeoutMs),
          });
          lastStatusCode = response.status;
          lastErrorMessage = null;
          lastResponseExcerpt = null;
          if (response.ok) {
            return {
              ok: true,
              statusCode: response.status,
              attempts: attempt,
              deliveryId,
              responseExcerpt: null,
              errorMessage: null,
            };
          }

          const responseText = await response.text();
          lastResponseExcerpt = responseText ? responseText.slice(0, 200) : null;
          lastErrorMessage = `Webhook returned HTTP ${response.status}`;
        } catch (err) {
          lastStatusCode = 502;
          lastErrorMessage = err?.message || "Webhook request failed";
          lastResponseExcerpt = null;
        }

        if (attempt < retryAttempts) {
          await sleep(retryBackoffMs * attempt);
        }
      }

      return {
        ok: false,
        statusCode: lastStatusCode,
        attempts: retryAttempts,
        deliveryId,
        responseExcerpt: lastResponseExcerpt,
        errorMessage: lastErrorMessage,
      };
    },
  };
}
