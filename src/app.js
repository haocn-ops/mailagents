import { URL } from "node:url";
import { createJwt, verifyJwt } from "./auth.js";
import { config } from "./config.js";
import { createPaymentVerifier } from "./payment.js";
import { createSiweService } from "./siwe.js";
import { getDefaultStore } from "./store.js";
import { createNonce, createRequestId, json, parseBearerToken, parsePeriod, readJsonBody } from "./utils.js";

function unauthorized(res, requestId, message = "Unauthorized") {
  json(res, 401, { error: "unauthorized", message }, requestId);
}

function forbidden(res, requestId, message = "Forbidden") {
  json(res, 403, { error: "forbidden", message }, requestId);
}

function badRequest(res, requestId, message) {
  json(res, 400, { error: "bad_request", message }, requestId);
}

function paymentRequired(
  res,
  requestId,
  message = "x402 payment proof is required for this endpoint",
  code = "payment_required",
) {
  json(res, 402, { error: code, message }, requestId);
}

export function createApp(deps = {}) {
  const store = deps.store || getDefaultStore();
  const paymentVerifier =
    deps.paymentVerifier ||
    createPaymentVerifier({
      mode: config.paymentMode,
      hmacSecret: config.paymentHmacSecret,
      hmacSkewSec: config.paymentHmacSkewSec,
    });
  const siweService =
    deps.siweService ||
    createSiweService({
      mode: config.siweMode,
      chainId: config.baseChainId,
      domain: config.siweDomain,
      uri: config.siweUri,
      statement: config.siweStatement,
    });

  async function requireAuth(req, res, requestId) {
    const token = parseBearerToken(req.headers.authorization);
    if (!token) {
      unauthorized(res, requestId);
      return null;
    }

    try {
      const payload = verifyJwt(token, config.jwtSecret);
      const ctx = await store.findTenantContext(payload.tenant_id, payload.agent_id);
      if (!ctx) {
        forbidden(res, requestId, "Tenant/agent context not found");
        return null;
      }
      return payload;
    } catch (err) {
      unauthorized(res, requestId, err.message);
      return null;
    }
  }

  function requirePayment(req, res, requestId) {
    const result = paymentVerifier.verify(req);
    if (!result.ok) {
      paymentRequired(res, requestId, result.message, result.code);
      return false;
    }
    return true;
  }

  return async function app(req, res) {
    const requestId = createRequestId();
    const method = req.method || "GET";
    const requestUrl = new URL(req.url || "/", "http://localhost");
    const path = requestUrl.pathname;

    try {
      if (method === "GET" && path === "/healthz") {
        json(
          res,
          200,
          {
            status: "ok",
            service: "agent-mail-cloud",
          },
          requestId,
        );
        return;
      }

      if (method === "POST" && path === "/v1/auth/siwe/challenge") {
        const body = await readJsonBody(req);
        const walletAddress = String(body.wallet_address || "").trim().toLowerCase();
        if (!walletAddress) {
          badRequest(res, requestId, "wallet_address is required");
          return;
        }

        const nonce = createNonce();
        const message = await siweService.createChallengeMessage(walletAddress, nonce);

        await store.saveChallenge(walletAddress, nonce, message);
        json(res, 200, { nonce, message }, requestId);
        return;
      }

      if (method === "POST" && path === "/v1/auth/siwe/verify") {
        const body = await readJsonBody(req);
        const message = String(body.message || "");
        const signature = String(body.signature || "");
        if (!message || !signature) {
          badRequest(res, requestId, "message and signature are required");
          return;
        }

        let parsed;
        try {
          parsed = await siweService.parseMessage(message);
        } catch (err) {
          if (err.code === "INVALID_SIWE_MESSAGE") {
            badRequest(res, requestId, err.message);
            return;
          }
          throw err;
        }

        const walletAddress = parsed.address;
        const nonce = parsed.nonce;
        const challenge = await store.getChallenge(walletAddress);

        if (!challenge || challenge.nonce !== nonce || challenge.message !== message) {
          unauthorized(res, requestId, "challenge mismatch or expired");
          return;
        }

        const verified = await siweService.verifySignature({
          message,
          signature,
          expectedAddress: walletAddress,
          expectedNonce: nonce,
        });

        if (!verified.ok) {
          unauthorized(res, requestId, verified.message || "invalid signature");
          return;
        }

        await store.consumeChallenge(walletAddress);
        const identity = await store.getOrCreateIdentity(walletAddress);

        const token = createJwt(
          {
            tenant_id: identity.tenantId,
            agent_id: identity.agentId,
            did: identity.did,
            scopes: ["mail:allocate", "mail:read", "webhook:write", "billing:read"],
          },
          config.jwtSecret,
          3600,
        );

        json(
          res,
          200,
          {
            access_token: token,
            token_type: "Bearer",
            expires_in: 3600,
            did: identity.did,
            tenant_id: identity.tenantId,
            agent_id: identity.agentId,
          },
          requestId,
        );
        return;
      }

      if (method === "POST" && path === "/v1/mailboxes/allocate") {
        const auth = await requireAuth(req, res, requestId);
        if (!auth) return;
        if (!requirePayment(req, res, requestId)) return;

        const body = await readJsonBody(req);
        const purpose = String(body.purpose || "").trim();
        const ttlHours = Number(body.ttl_hours);
        const agentId = String(body.agent_id || "");

        if (!agentId || !purpose || !Number.isFinite(ttlHours)) {
          badRequest(res, requestId, "agent_id, purpose, ttl_hours are required");
          return;
        }
        if (auth.agent_id !== agentId) {
          forbidden(res, requestId, "agent_id does not match token");
          return;
        }
        if (ttlHours < 1 || ttlHours > 720) {
          badRequest(res, requestId, "ttl_hours must be 1..720");
          return;
        }

        const result = await store.allocateMailbox({
          tenantId: auth.tenant_id,
          agentId,
          purpose,
          ttlHours,
        });

        if (!result) {
          json(
            res,
            409,
            { error: "no_available_mailbox", message: "No available mailbox for current tenant" },
            requestId,
          );
          return;
        }

        await store.recordUsage({
          tenantId: auth.tenant_id,
          agentId: auth.agent_id,
          endpoint: "POST /v1/mailboxes/allocate",
          quantity: 1,
          requestId,
        });

        json(
          res,
          200,
          {
            mailbox_id: result.mailbox.id,
            address: result.mailbox.address,
            lease_expires_at: result.lease.expiresAt,
          },
          requestId,
        );
        return;
      }

      if (method === "POST" && path === "/v1/mailboxes/release") {
        const auth = await requireAuth(req, res, requestId);
        if (!auth) return;

        const body = await readJsonBody(req);
        const mailboxId = String(body.mailbox_id || "");
        if (!mailboxId) {
          badRequest(res, requestId, "mailbox_id is required");
          return;
        }

        const result = await store.releaseMailbox({ tenantId: auth.tenant_id, mailboxId });
        if (!result) {
          json(res, 404, { error: "not_found", message: "Mailbox not found" }, requestId);
          return;
        }

        await store.recordUsage({
          tenantId: auth.tenant_id,
          agentId: auth.agent_id,
          endpoint: "POST /v1/mailboxes/release",
          quantity: 1,
          requestId,
        });

        json(res, 200, { status: "released" }, requestId);
        return;
      }

      if (method === "GET" && path === "/v1/messages/latest") {
        const auth = await requireAuth(req, res, requestId);
        if (!auth) return;
        if (!requirePayment(req, res, requestId)) return;

        const mailboxId = requestUrl.searchParams.get("mailbox_id");
        const since = requestUrl.searchParams.get("since");
        const limitRaw = requestUrl.searchParams.get("limit");
        const limit = limitRaw ? Number(limitRaw) : 20;

        if (!mailboxId) {
          badRequest(res, requestId, "mailbox_id is required");
          return;
        }
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
          badRequest(res, requestId, "limit must be 1..100");
          return;
        }

        const messages = await store.getLatestMessages({
          tenantId: auth.tenant_id,
          mailboxId,
          since,
          limit,
        });

        if (messages === null) {
          json(res, 404, { error: "not_found", message: "Mailbox not found" }, requestId);
          return;
        }

        await store.recordUsage({
          tenantId: auth.tenant_id,
          agentId: auth.agent_id,
          endpoint: "GET /v1/messages/latest",
          quantity: 1,
          requestId,
        });

        json(res, 200, { messages }, requestId);
        return;
      }

      if (method === "POST" && path === "/v1/webhooks") {
        const auth = await requireAuth(req, res, requestId);
        if (!auth) return;
        if (!requirePayment(req, res, requestId)) return;

        const body = await readJsonBody(req);
        const eventTypes = Array.isArray(body.event_types) ? body.event_types : null;
        const targetUrl = String(body.target_url || "").trim();
        const secret = String(body.secret || "");

        if (!eventTypes || !targetUrl || !secret) {
          badRequest(res, requestId, "event_types, target_url, secret are required");
          return;
        }
        if (secret.length < 16) {
          badRequest(res, requestId, "secret must have at least 16 chars");
          return;
        }

        const allowedEvents = new Set(["mail.received", "otp.extracted"]);
        if (eventTypes.some((e) => !allowedEvents.has(e))) {
          badRequest(res, requestId, "event_types contains unsupported values");
          return;
        }

        const webhook = await store.createWebhook({
          tenantId: auth.tenant_id,
          eventTypes,
          targetUrl,
          secret,
        });

        await store.recordUsage({
          tenantId: auth.tenant_id,
          agentId: auth.agent_id,
          endpoint: "POST /v1/webhooks",
          quantity: 1,
          requestId,
        });

        json(
          res,
          200,
          {
            webhook_id: webhook.id,
            event_types: webhook.eventTypes,
            target_url: webhook.targetUrl,
            status: webhook.status,
          },
          requestId,
        );
        return;
      }

      if (method === "GET" && path === "/v1/usage/summary") {
        const auth = await requireAuth(req, res, requestId);
        if (!auth) return;

        const period = requestUrl.searchParams.get("period");
        const parsed = parsePeriod(period);
        if (!parsed) {
          badRequest(res, requestId, "period must match YYYY-MM");
          return;
        }

        const summary = await store.usageSummary(auth.tenant_id, parsed.start, parsed.end);
        json(
          res,
          200,
          {
            period,
            api_calls: summary.api_calls,
            active_mailboxes: summary.active_mailboxes,
            message_parses: summary.message_parses,
            billable_units: summary.billable_units,
          },
          requestId,
        );
        return;
      }

      if (method === "GET" && path.startsWith("/v1/billing/invoices/")) {
        const auth = await requireAuth(req, res, requestId);
        if (!auth) return;

        const invoiceId = path.replace("/v1/billing/invoices/", "").trim();
        if (!invoiceId) {
          badRequest(res, requestId, "invoice_id is required");
          return;
        }

        const invoice = await store.getInvoice(invoiceId, auth.tenant_id);
        if (!invoice) {
          json(res, 404, { error: "not_found", message: "Invoice not found" }, requestId);
          return;
        }

        json(
          res,
          200,
          {
            invoice_id: invoice.id,
            tenant_id: invoice.tenantId,
            period_start: invoice.periodStart,
            period_end: invoice.periodEnd,
            amount_usdc: invoice.amountUsdc,
            status: invoice.status,
            statement_hash: invoice.statementHash,
            settlement_tx_hash: invoice.settlementTxHash,
          },
          requestId,
        );
        return;
      }

      json(res, 404, { error: "not_found", message: "Route not found" }, requestId);
    } catch (err) {
      if (err.message === "Invalid JSON") {
        badRequest(res, requestId, err.message);
        return;
      }
      if (err.message === "Payload too large") {
        json(res, 413, { error: "payload_too_large", message: err.message }, requestId);
        return;
      }
      if (err.code === "SIWE_UNAVAILABLE") {
        json(res, 500, { error: "siwe_unavailable", message: err.message }, requestId);
        return;
      }

      json(
        res,
        500,
        {
          error: "internal_error",
          message: "Unexpected server error",
          detail: process.env.NODE_ENV === "production" ? undefined : err.message,
        },
        requestId,
      );
    }
  };
}
