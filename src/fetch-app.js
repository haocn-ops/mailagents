import { createJwt, verifyJwt } from "./auth.js";
import { createConfig } from "./config.js";
import { createMailBackendAdapter } from "./mail-backend/index.js";
import { createPaymentVerifier } from "./payment.js";
import { parseInboundContent } from "./parser.js";
import { createSiweService } from "./siwe.js";
import { renderAdminDashboardHtml } from "./admin-ui.js";
import { renderUserAppHtml } from "./user-ui.js";
import { getDefaultStore } from "./store.js";
import { createNonce, createRequestId, parseBearerToken, parsePeriod } from "./utils.js";
import { createWebhookDispatcher } from "./webhook-dispatcher.js";

function jsonResponse(status, payload, requestId) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "x-request-id": requestId,
  });
  return new Response(JSON.stringify(payload), { status, headers });
}

function parsePaging(requestUrl) {
  const page = Number(requestUrl.searchParams.get("page") || "1");
  const pageSize = Number(requestUrl.searchParams.get("page_size") || "20");
  if (!Number.isInteger(page) || page < 1) {
    return { ok: false, message: "page must be >= 1" };
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) {
    return { ok: false, message: "page_size must be 1..200" };
  }
  return { ok: true, page, pageSize };
}

async function readJsonBody(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON");
  }
}

export function createFetchApp(deps = {}) {
  const runtimeConfig = deps.config || createConfig(process.env);
  const store = deps.store || getDefaultStore();
  const paymentVerifier =
    deps.paymentVerifier ||
    createPaymentVerifier({
      mode: runtimeConfig.paymentMode,
      hmacSecret: runtimeConfig.paymentHmacSecret,
      hmacSkewSec: runtimeConfig.paymentHmacSkewSec,
    });
  const siweService =
    deps.siweService ||
    createSiweService({
      mode: runtimeConfig.siweMode,
      chainId: runtimeConfig.baseChainId,
      domain: runtimeConfig.siweDomain,
      uri: runtimeConfig.siweUri,
      statement: runtimeConfig.siweStatement,
    });
  const mailBackend = deps.mailBackend || deps.mailProvider || createMailBackendAdapter(runtimeConfig);
  const webhookDispatcher =
    deps.webhookDispatcher ||
    createWebhookDispatcher({
      secretEncryptionKey: runtimeConfig.webhookSecretEncryptionKey,
      timeoutMs: runtimeConfig.webhookTimeoutMs,
      retryAttempts: runtimeConfig.webhookRetryAttempts,
    });

  async function requireAuth(request, requestId) {
    const token = parseBearerToken(request.headers.get("authorization"));
    if (!token) {
      return {
        ok: false,
        response: jsonResponse(401, { error: "unauthorized", message: "Unauthorized" }, requestId),
      };
    }

    try {
      const payload = verifyJwt(token, runtimeConfig.jwtSecret);
      const ctx = await store.findTenantContext(payload.tenant_id, payload.agent_id);
      if (!ctx) {
        return {
          ok: false,
          response: jsonResponse(
            403,
            { error: "forbidden", message: "Tenant/agent context not found" },
            requestId,
          ),
        };
      }
      return { ok: true, payload };
    } catch (err) {
      return {
        ok: false,
        response: jsonResponse(401, { error: "unauthorized", message: err.message }, requestId),
      };
    }
  }

  function requireInternalAuth(request, requestId) {
    if (!runtimeConfig.internalApiToken) {
      return {
        ok: false,
        response: jsonResponse(
          500,
          { error: "internal_api_unconfigured", message: "INTERNAL_API_TOKEN is not configured" },
          requestId,
        ),
      };
    }

    const token =
      parseBearerToken(request.headers.get("authorization")) || request.headers.get("x-internal-token");
    if (!token || token !== runtimeConfig.internalApiToken) {
      return {
        ok: false,
        response: jsonResponse(401, { error: "unauthorized", message: "Invalid internal token" }, requestId),
      };
    }
    return { ok: true };
  }

  async function requireAdminAuth(request, requestId) {
    if (runtimeConfig.adminApiToken) {
      const token =
        parseBearerToken(request.headers.get("authorization")) || request.headers.get("x-admin-token");
      if (!token || token !== runtimeConfig.adminApiToken) {
        return {
          ok: false,
          response: jsonResponse(401, { error: "unauthorized", message: "Invalid admin token" }, requestId),
        };
      }
      return { ok: true, actorDid: "system:admin-token" };
    }

    const auth = await requireAuth(request, requestId);
    if (!auth.ok) return auth;
    return { ok: true, actorDid: auth.payload.did, payload: auth.payload };
  }

  function requirePayment(request, requestId) {
    const result = paymentVerifier.verify(request);
    if (!result.ok) {
      return {
        ok: false,
        response: jsonResponse(402, { error: result.code, message: result.message }, requestId),
      };
    }
    return { ok: true };
  }

  return async function handleRequest(request) {
    const requestId = createRequestId();
    const method = request.method || "GET";
    const requestUrl = new URL(request.url);
    const path = requestUrl.pathname;

    try {
      if (method === "GET" && path === "/healthz") {
        return jsonResponse(200, { status: "ok", service: "agent-mail-cloud" }, requestId);
      }

      if (method === "GET" && (path === "/admin" || path === "/admin/")) {
        return new Response(renderAdminDashboardHtml({ adminTokenRequired: Boolean(runtimeConfig.adminApiToken) }), {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }

      if (method === "GET" && (path === "/app" || path === "/app/")) {
        return new Response(renderUserAppHtml(), {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }

      if (method === "POST" && path === "/v1/auth/siwe/challenge") {
        const body = await readJsonBody(request);
        const walletAddress = String(body.wallet_address || "").trim().toLowerCase();
        if (!walletAddress) {
          return jsonResponse(400, { error: "bad_request", message: "wallet_address is required" }, requestId);
        }

        const nonce = createNonce();
        const message = await siweService.createChallengeMessage(walletAddress, nonce);
        await store.saveChallenge(walletAddress, nonce, message);

        return jsonResponse(200, { nonce, message }, requestId);
      }

      if (method === "POST" && path === "/v1/auth/siwe/verify") {
        const body = await readJsonBody(request);
        const message = String(body.message || "");
        const signature = String(body.signature || "");
        if (!message || !signature) {
          return jsonResponse(400, { error: "bad_request", message: "message and signature are required" }, requestId);
        }

        let parsed;
        try {
          parsed = await siweService.parseMessage(message);
        } catch (err) {
          if (err.code === "INVALID_SIWE_MESSAGE") {
            return jsonResponse(400, { error: "bad_request", message: err.message }, requestId);
          }
          throw err;
        }

        const walletAddress = parsed.address;
        const nonce = parsed.nonce;
        const challenge = await store.getChallenge(walletAddress);

        if (!challenge || challenge.nonce !== nonce || challenge.message !== message) {
          return jsonResponse(401, { error: "unauthorized", message: "challenge mismatch or expired" }, requestId);
        }

        const verified = await siweService.verifySignature({
          message,
          signature,
          expectedAddress: walletAddress,
          expectedNonce: nonce,
        });

        if (!verified.ok) {
          return jsonResponse(401, { error: "unauthorized", message: verified.message || "invalid signature" }, requestId);
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
          runtimeConfig.jwtSecret,
          3600,
        );

        return jsonResponse(
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
      }

      if (method === "POST" && path === "/v1/mailboxes/allocate") {
        const auth = await requireAuth(request, requestId);
        if (!auth.ok) return auth.response;
        const pay = requirePayment(request, requestId);
        if (!pay.ok) return pay.response;

        const body = await readJsonBody(request);
        const purpose = String(body.purpose || "").trim();
        const ttlHours = Number(body.ttl_hours);
        const agentId = String(body.agent_id || "");

        if (!agentId || !purpose || !Number.isFinite(ttlHours)) {
          return jsonResponse(400, { error: "bad_request", message: "agent_id, purpose, ttl_hours are required" }, requestId);
        }
        if (auth.payload.agent_id !== agentId) {
          return jsonResponse(403, { error: "forbidden", message: "agent_id does not match token" }, requestId);
        }
        if (ttlHours < 1 || ttlHours > 720) {
          return jsonResponse(400, { error: "bad_request", message: "ttl_hours must be 1..720" }, requestId);
        }

        const result = await store.allocateMailbox({
          tenantId: auth.payload.tenant_id,
          agentId,
          purpose,
          ttlHours,
        });

        if (!result) {
          return jsonResponse(409, { error: "no_available_mailbox", message: "No available mailbox for current tenant" }, requestId);
        }

        try {
          const provider = await mailBackend.provisionMailbox({
            tenantId: auth.payload.tenant_id,
            agentId,
            mailboxId: result.mailbox.id,
            address: result.mailbox.address,
            ttlHours,
          });
          if (provider?.providerRef) {
            await store.saveMailboxProviderRef(result.mailbox.id, provider.providerRef);
          }
        } catch (err) {
          await store.releaseMailbox({ tenantId: auth.payload.tenant_id, mailboxId: result.mailbox.id });
          return jsonResponse(
            502,
            { error: "mail_backend_error", message: err.message || "Mail backend provisioning failed" },
            requestId,
          );
        }

        await store.recordUsage({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          endpoint: "POST /v1/mailboxes/allocate",
          quantity: 1,
          requestId,
        });

        return jsonResponse(
          200,
          {
            mailbox_id: result.mailbox.id,
            address: result.mailbox.address,
            lease_expires_at: result.lease.expiresAt,
          },
          requestId,
        );
      }

      if (method === "POST" && path === "/v1/mailboxes/release") {
        const auth = await requireAuth(request, requestId);
        if (!auth.ok) return auth.response;

        const body = await readJsonBody(request);
        const mailboxId = String(body.mailbox_id || "");
        if (!mailboxId) {
          return jsonResponse(400, { error: "bad_request", message: "mailbox_id is required" }, requestId);
        }

        const result = await store.releaseMailbox({ tenantId: auth.payload.tenant_id, mailboxId });
        if (!result) {
          return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
        }

        try {
          await mailBackend.releaseMailbox({
            tenantId: auth.payload.tenant_id,
            mailboxId,
            address: result.mailbox.address,
            providerRef: result.mailbox.providerRef || null,
          });
        } catch (err) {
          return jsonResponse(
            502,
            { error: "mail_backend_error", message: err.message || "Mail backend release failed" },
            requestId,
          );
        }

        await store.recordUsage({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          endpoint: "POST /v1/mailboxes/release",
          quantity: 1,
          requestId,
        });

        return jsonResponse(200, { status: "released" }, requestId);
      }

      if (method === "GET" && path === "/v1/mailboxes") {
        const auth = await requireAuth(request, requestId);
        if (!auth.ok) return auth.response;

        const items = await store.listTenantMailboxes(auth.payload.tenant_id);
        return jsonResponse(200, { items }, requestId);
      }

      if (method === "GET" && path === "/v1/messages/latest") {
        const auth = await requireAuth(request, requestId);
        if (!auth.ok) return auth.response;
        const pay = requirePayment(request, requestId);
        if (!pay.ok) return pay.response;

        const mailboxId = requestUrl.searchParams.get("mailbox_id");
        const since = requestUrl.searchParams.get("since");
        const limitRaw = requestUrl.searchParams.get("limit");
        const limit = limitRaw ? Number(limitRaw) : 20;

        if (!mailboxId) {
          return jsonResponse(400, { error: "bad_request", message: "mailbox_id is required" }, requestId);
        }
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
          return jsonResponse(400, { error: "bad_request", message: "limit must be 1..100" }, requestId);
        }

        const messages = await store.getLatestMessages({
          tenantId: auth.payload.tenant_id,
          mailboxId,
          since,
          limit,
        });
        if (messages === null) {
          return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
        }

        await store.recordUsage({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          endpoint: "GET /v1/messages/latest",
          quantity: 1,
          requestId,
        });

        return jsonResponse(200, { messages }, requestId);
      }

      if (method === "GET" && path.startsWith("/v1/messages/")) {
        const auth = await requireAuth(request, requestId);
        if (!auth.ok) return auth.response;

        const messageId = path.replace("/v1/messages/", "").trim();
        if (!messageId) {
          return jsonResponse(400, { error: "bad_request", message: "message_id is required" }, requestId);
        }

        const message = await store.getTenantMessageDetail(auth.payload.tenant_id, messageId);
        if (!message) {
          return jsonResponse(404, { error: "not_found", message: "Message not found" }, requestId);
        }
        return jsonResponse(200, message, requestId);
      }

      if (method === "POST" && path === "/v1/webhooks") {
        const auth = await requireAuth(request, requestId);
        if (!auth.ok) return auth.response;
        const pay = requirePayment(request, requestId);
        if (!pay.ok) return pay.response;

        const body = await readJsonBody(request);
        const eventTypes = Array.isArray(body.event_types) ? body.event_types : null;
        const targetUrl = String(body.target_url || "").trim();
        const secret = String(body.secret || "");

        if (!eventTypes || !targetUrl || !secret) {
          return jsonResponse(400, { error: "bad_request", message: "event_types, target_url, secret are required" }, requestId);
        }
        if (secret.length < 16) {
          return jsonResponse(400, { error: "bad_request", message: "secret must have at least 16 chars" }, requestId);
        }

        const allowedEvents = new Set(["mail.received", "otp.extracted"]);
        if (eventTypes.some((e) => !allowedEvents.has(e))) {
          return jsonResponse(400, { error: "bad_request", message: "event_types contains unsupported values" }, requestId);
        }

        const webhook = await store.createWebhook({
          tenantId: auth.payload.tenant_id,
          eventTypes,
          targetUrl,
          secret,
        });

        await store.recordUsage({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          endpoint: "POST /v1/webhooks",
          quantity: 1,
          requestId,
        });

        return jsonResponse(
          200,
          {
            webhook_id: webhook.id,
            event_types: webhook.eventTypes,
            target_url: webhook.targetUrl,
            status: webhook.status,
          },
          requestId,
        );
      }

      if (method === "GET" && path === "/v1/webhooks") {
        const auth = await requireAuth(request, requestId);
        if (!auth.ok) return auth.response;

        const items = await store.listTenantWebhooks(auth.payload.tenant_id);
        return jsonResponse(200, { items }, requestId);
      }

      if (method === "GET" && path === "/v1/usage/summary") {
        const auth = await requireAuth(request, requestId);
        if (!auth.ok) return auth.response;

        const period = requestUrl.searchParams.get("period");
        const parsed = parsePeriod(period);
        if (!parsed) {
          return jsonResponse(400, { error: "bad_request", message: "period must match YYYY-MM" }, requestId);
        }

        const summary = await store.usageSummary(auth.payload.tenant_id, parsed.start, parsed.end);
        return jsonResponse(
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
      }

      if (method === "GET" && path.startsWith("/v1/billing/invoices/")) {
        const auth = await requireAuth(request, requestId);
        if (!auth.ok) return auth.response;

        const invoiceId = path.replace("/v1/billing/invoices/", "").trim();
        if (!invoiceId) {
          return jsonResponse(400, { error: "bad_request", message: "invoice_id is required" }, requestId);
        }

        const invoice = await store.getInvoice(invoiceId, auth.payload.tenant_id);
        if (!invoice) {
          return jsonResponse(404, { error: "not_found", message: "Invoice not found" }, requestId);
        }

        return jsonResponse(
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
      }

      if (method === "GET" && path === "/v1/billing/invoices") {
        const auth = await requireAuth(request, requestId);
        if (!auth.ok) return auth.response;

        const period = requestUrl.searchParams.get("period");
        const items = await store.listTenantInvoices(auth.payload.tenant_id, period);
        return jsonResponse(200, { items }, requestId);
      }

      if (method === "POST" && path === "/internal/inbound/events") {
        const auth = requireInternalAuth(request, requestId);
        if (!auth.ok) return auth.response;

        const body = await readJsonBody(request);
        const mailboxAddress = String(body.address || "").trim().toLowerCase();
        const sender = String(body.sender || "").trim().toLowerCase();
        const senderDomain = String(body.sender_domain || "").trim().toLowerCase();
        const subject = String(body.subject || "").trim();
        const providerMessageId = String(body.provider_message_id || "").trim() || null;
        const rawRef = String(body.raw_ref || "").trim() || null;
        const receivedAt = String(body.received_at || "").trim() || new Date().toISOString();
        const textExcerpt = String(body.text_excerpt || "").trim() || null;
        const htmlExcerpt = String(body.html_excerpt || "").trim() || null;
        const htmlBody = String(body.html_body || "").trim() || null;
        const headers = body.headers && typeof body.headers === "object" ? body.headers : {};

        if (!mailboxAddress || !senderDomain) {
          return jsonResponse(
            400,
            { error: "bad_request", message: "address and sender_domain are required" },
            requestId,
          );
        }

        const mailbox = await store.findMailboxByAddress(mailboxAddress);
        if (!mailbox) {
          return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
        }

        const ingested = await store.ingestInboundMessage({
          tenantId: mailbox.tenantId,
          mailboxId: mailbox.id,
          providerMessageId,
          sender,
          senderDomain,
          subject,
          rawRef,
          receivedAt,
          payload: {
            headers,
            text_excerpt: textExcerpt,
            html_excerpt: htmlExcerpt,
            html_body: htmlBody,
          },
          requestId,
        });

        const parsed = parseInboundContent({
          subject,
          textExcerpt,
          htmlExcerpt,
          htmlBody,
        });
        await store.applyMessageParseResult({
          messageId: ingested.messageId,
          otpCode: parsed.otpCode,
          verificationLink: parsed.verificationLink,
          payload: {
            parser: "builtin",
            source: "mailu-internal-event",
            parser_status: parsed.parserStatus,
          },
          requestId,
        });

        const eventType = parsed.parsed ? "otp.extracted" : "mail.received";
        const message = await store.getMessage(ingested.messageId);
        const webhooks = await store.listActiveWebhooksByEvent(mailbox.tenantId, eventType);
        for (const webhook of webhooks) {
          const delivery = await webhookDispatcher.dispatch({
            webhook,
            payload: {
              event_type: eventType,
              tenant_id: mailbox.tenantId,
              mailbox_id: mailbox.id,
              message_id: ingested.messageId,
              sender,
              sender_domain: senderDomain,
              subject,
              received_at: receivedAt,
              otp_code: parsed.otpCode,
              verification_link: parsed.verificationLink,
              message,
            },
          });
          await store.recordWebhookDelivery(webhook.id, {
            statusCode: delivery.statusCode,
            requestId,
            metadata: {
              event_type: eventType,
              delivery_id: delivery.deliveryId,
              attempts: delivery.attempts,
              ok: delivery.ok,
            },
          });
        }

        return jsonResponse(
          202,
          {
            status: "accepted",
            tenant_id: ingested.tenantId,
            mailbox_id: ingested.mailboxId,
            message_id: ingested.messageId,
          },
          requestId,
        );
      }

      if (method === "POST" && path === "/internal/mailboxes/provision") {
        const auth = requireInternalAuth(request, requestId);
        if (!auth.ok) return auth.response;

        const body = await readJsonBody(request);
        const mailboxAddress = String(body.address || "").trim().toLowerCase();
        const providerRef = String(body.provider_ref || "").trim() || null;
        if (!mailboxAddress) {
          return jsonResponse(400, { error: "bad_request", message: "address is required" }, requestId);
        }

        const mailbox = await store.findMailboxByAddress(mailboxAddress);
        if (!mailbox) {
          return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
        }

        if (providerRef) {
          await store.saveMailboxProviderRef(mailbox.id, providerRef);
        }
        await store.recordMailboxBackendEvent({
          tenantId: mailbox.tenantId,
          mailboxId: mailbox.id,
          action: "mailbox.backend_provisioned",
          requestId,
          metadata: { provider_ref: providerRef },
        });

        return jsonResponse(
          202,
          {
            status: "accepted",
            tenant_id: mailbox.tenantId,
            mailbox_id: mailbox.id,
            provider_ref: providerRef,
          },
          requestId,
        );
      }

      if (method === "POST" && path === "/internal/mailboxes/release") {
        const auth = requireInternalAuth(request, requestId);
        if (!auth.ok) return auth.response;

        const body = await readJsonBody(request);
        const mailboxAddress = String(body.address || "").trim().toLowerCase();
        const providerRef = String(body.provider_ref || "").trim() || null;
        if (!mailboxAddress) {
          return jsonResponse(400, { error: "bad_request", message: "address is required" }, requestId);
        }

        const mailbox = await store.findMailboxByAddress(mailboxAddress);
        if (!mailbox) {
          return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
        }

        if (providerRef) {
          await store.saveMailboxProviderRef(mailbox.id, providerRef);
        }
        await store.recordMailboxBackendEvent({
          tenantId: mailbox.tenantId,
          mailboxId: mailbox.id,
          action: "mailbox.backend_released",
          requestId,
          metadata: { provider_ref: providerRef },
        });

        return jsonResponse(
          202,
          {
            status: "accepted",
            tenant_id: mailbox.tenantId,
            mailbox_id: mailbox.id,
            provider_ref: providerRef,
          },
          requestId,
        );
      }

      if (method === "GET" && path.startsWith("/internal/mailboxes/")) {
        const auth = requireInternalAuth(request, requestId);
        if (!auth.ok) return auth.response;

        const mailboxAddress = decodeURIComponent(path.replace("/internal/mailboxes/", "")).trim().toLowerCase();
        if (!mailboxAddress) {
          return jsonResponse(400, { error: "bad_request", message: "address is required" }, requestId);
        }

        const mailbox = await store.findMailboxByAddress(mailboxAddress);
        if (!mailbox) {
          return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
        }

        const lease = await store.getActiveLeaseByMailboxId(mailbox.id);
        return jsonResponse(
          200,
          {
            mailbox_id: mailbox.id,
            tenant_id: mailbox.tenantId,
            address: mailbox.address,
            status: mailbox.status,
            provider_ref: mailbox.providerRef || null,
            active_lease: lease
              ? {
                  lease_id: lease.id,
                  agent_id: lease.agentId,
                  purpose: lease.purpose,
                  status: lease.status,
                  started_at: lease.startedAt,
                  expires_at: lease.expiresAt,
                }
              : null,
          },
          requestId,
        );
      }

      if (method === "GET" && path.startsWith("/internal/messages/")) {
        const auth = requireInternalAuth(request, requestId);
        if (!auth.ok) return auth.response;

        const messageId = decodeURIComponent(path.replace("/internal/messages/", "")).trim();
        if (!messageId) {
          return jsonResponse(400, { error: "bad_request", message: "message_id is required" }, requestId);
        }

        const message = await store.getMessage(messageId);
        if (!message) {
          return jsonResponse(404, { error: "not_found", message: "Message not found" }, requestId);
        }

        return jsonResponse(
          200,
          {
            message_id: message.messageId,
            tenant_id: message.tenantId,
            mailbox_id: message.mailboxId,
            provider_message_id: message.providerMessageId || null,
            sender: message.sender,
            sender_domain: message.senderDomain,
            subject: message.subject,
            raw_ref: message.rawRef || null,
            received_at: message.receivedAt,
          },
          requestId,
        );
      }

      if (path.startsWith("/v1/admin/")) {
        const auth = await requireAdminAuth(request, requestId);
        if (!auth.ok) return auth.response;
        const paging = parsePaging(requestUrl);
        const actorDid = auth.actorDid;

        if (method === "GET" && path === "/v1/admin/overview/metrics") {
          const metrics = await store.adminOverviewMetrics();
          return jsonResponse(200, metrics, requestId);
        }

        if (method === "GET" && path === "/v1/admin/overview/timeseries") {
          const bucket = requestUrl.searchParams.get("bucket") || "hour";
          if (!["minute", "hour", "day"].includes(bucket)) {
            return jsonResponse(400, { error: "bad_request", message: "bucket must be minute, hour or day" }, requestId);
          }
          const points = await store.adminOverviewTimeseries({
            from: requestUrl.searchParams.get("from"),
            to: requestUrl.searchParams.get("to"),
            bucket,
          });
          return jsonResponse(200, points, requestId);
        }

        if (method === "GET" && path === "/v1/admin/tenants") {
          if (!paging.ok) return jsonResponse(400, { error: "bad_request", message: paging.message }, requestId);
          const status = requestUrl.searchParams.get("status");
          const result = await store.adminListTenants({ page: paging.page, pageSize: paging.pageSize, status });
          return jsonResponse(200, result, requestId);
        }

        if (path.startsWith("/v1/admin/tenants/")) {
          const tenantId = path.replace("/v1/admin/tenants/", "").trim();
          if (!tenantId) {
            return jsonResponse(400, { error: "bad_request", message: "tenant_id is required" }, requestId);
          }

          if (method === "GET") {
            const tenant = await store.adminGetTenant(tenantId);
            if (!tenant) {
              return jsonResponse(404, { error: "not_found", message: "Tenant not found" }, requestId);
            }
            return jsonResponse(200, tenant, requestId);
          }

          if (method === "PATCH") {
            const body = await readJsonBody(request);
            const tenant = await store.adminPatchTenant(tenantId, body, { actorDid, requestId });
            if (!tenant) {
              return jsonResponse(404, { error: "not_found", message: "Tenant not found" }, requestId);
            }
            return jsonResponse(200, tenant, requestId);
          }
        }

        if (method === "GET" && path === "/v1/admin/mailboxes") {
          if (!paging.ok) return jsonResponse(400, { error: "bad_request", message: paging.message }, requestId);
          const result = await store.adminListMailboxes({
            page: paging.page,
            pageSize: paging.pageSize,
            status: requestUrl.searchParams.get("status"),
            tenantId: requestUrl.searchParams.get("tenant_id"),
          });
          return jsonResponse(200, result, requestId);
        }

        if (path.startsWith("/v1/admin/mailboxes/") && path.endsWith("/freeze") && method === "POST") {
          const mailboxId = path.slice("/v1/admin/mailboxes/".length, -"/freeze".length);
          const body = await readJsonBody(request);
          if (!String(body.reason || "").trim()) {
            return jsonResponse(400, { error: "bad_request", message: "reason is required" }, requestId);
          }
          const result = await store.adminFreezeMailbox(mailboxId, {
            reason: String(body.reason).trim(),
            actorDid,
            requestId,
          });
          if (!result) {
            return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
          }
          return jsonResponse(200, result, requestId);
        }

        if (path.startsWith("/v1/admin/mailboxes/") && path.endsWith("/release") && method === "POST") {
          const mailboxId = path.slice("/v1/admin/mailboxes/".length, -"/release".length);
          const result = await store.adminReleaseMailbox(mailboxId, { actorDid, requestId });
          if (!result) {
            return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
          }
          return jsonResponse(200, result, requestId);
        }

        if (method === "GET" && path === "/v1/admin/messages") {
          if (!paging.ok) return jsonResponse(400, { error: "bad_request", message: paging.message }, requestId);
          const result = await store.adminListMessages({
            page: paging.page,
            pageSize: paging.pageSize,
            mailboxId: requestUrl.searchParams.get("mailbox_id"),
            parsedStatus: requestUrl.searchParams.get("parsed_status"),
          });
          return jsonResponse(200, result, requestId);
        }

        if (path.startsWith("/v1/admin/messages/") && path.endsWith("/reparse") && method === "POST") {
          const messageId = path.slice("/v1/admin/messages/".length, -"/reparse".length);
          const result = await store.adminReparseMessage(messageId, { actorDid, requestId });
          if (!result) {
            return jsonResponse(404, { error: "not_found", message: "Message not found" }, requestId);
          }
          return jsonResponse(202, result, requestId);
        }

        if (path.startsWith("/v1/admin/messages/") && path.endsWith("/replay-webhook") && method === "POST") {
          const messageId = path.slice("/v1/admin/messages/".length, -"/replay-webhook".length);
          const result = await store.adminReplayMessageWebhook(messageId, { actorDid, requestId });
          if (!result) {
            return jsonResponse(404, { error: "not_found", message: "Message not found" }, requestId);
          }
          return jsonResponse(202, result, requestId);
        }

        if (method === "GET" && path === "/v1/admin/webhooks") {
          if (!paging.ok) return jsonResponse(400, { error: "bad_request", message: paging.message }, requestId);
          const result = await store.adminListWebhooks({ page: paging.page, pageSize: paging.pageSize });
          return jsonResponse(200, result, requestId);
        }

        if (path.startsWith("/v1/admin/webhooks/") && path.endsWith("/replay") && method === "POST") {
          const webhookId = path.slice("/v1/admin/webhooks/".length, -"/replay".length);
          const body = await readJsonBody(request);
          const result = await store.adminReplayWebhook(webhookId, {
            from: body.from,
            to: body.to,
            actorDid,
            requestId,
          });
          if (!result) {
            return jsonResponse(404, { error: "not_found", message: "Webhook not found" }, requestId);
          }
          return jsonResponse(202, result, requestId);
        }

        if (path.startsWith("/v1/admin/webhooks/") && path.endsWith("/rotate-secret") && method === "POST") {
          const webhookId = path.slice("/v1/admin/webhooks/".length, -"/rotate-secret".length);
          const result = await store.adminRotateWebhookSecret(webhookId, { actorDid, requestId });
          if (!result) {
            return jsonResponse(404, { error: "not_found", message: "Webhook not found" }, requestId);
          }
          return jsonResponse(200, result, requestId);
        }

        if (method === "GET" && path === "/v1/admin/invoices") {
          if (!paging.ok) return jsonResponse(400, { error: "bad_request", message: paging.message }, requestId);
          const result = await store.adminListInvoices({
            page: paging.page,
            pageSize: paging.pageSize,
            period: requestUrl.searchParams.get("period"),
          });
          return jsonResponse(200, result, requestId);
        }

        if (path.startsWith("/v1/admin/invoices/") && path.endsWith("/issue") && method === "POST") {
          const invoiceId = path.slice("/v1/admin/invoices/".length, -"/issue".length);
          const result = await store.adminIssueInvoice(invoiceId, { actorDid, requestId });
          if (!result) {
            return jsonResponse(404, { error: "not_found", message: "Invoice not found" }, requestId);
          }
          return jsonResponse(200, result, requestId);
        }

        if (method === "GET" && path === "/v1/admin/risk/events") {
          if (!paging.ok) return jsonResponse(400, { error: "bad_request", message: paging.message }, requestId);
          const result = await store.adminListRiskEvents({ page: paging.page, pageSize: paging.pageSize });
          return jsonResponse(200, result, requestId);
        }

        if (method === "POST" && path === "/v1/admin/risk/policies") {
          const body = await readJsonBody(request);
          const policyType = String(body.policy_type || "");
          const value = String(body.value || "");
          const action = String(body.action || "");
          if (!policyType || !value || !action) {
            return jsonResponse(400, { error: "bad_request", message: "policy_type, value and action are required" }, requestId);
          }
          const result = await store.adminUpsertRiskPolicy({
            policyType,
            value,
            action,
            actorDid,
            requestId,
          });
          return jsonResponse(200, result, requestId);
        }

        if (method === "GET" && path === "/v1/admin/audit/logs") {
          if (!paging.ok) return jsonResponse(400, { error: "bad_request", message: paging.message }, requestId);
          const result = await store.adminListAuditLogs({
            page: paging.page,
            pageSize: paging.pageSize,
            requestId: requestUrl.searchParams.get("request_id"),
            tenantId: requestUrl.searchParams.get("tenant_id"),
            actorDid: requestUrl.searchParams.get("actor_did"),
          });
          return jsonResponse(200, result, requestId);
        }
      }

      return jsonResponse(404, { error: "not_found", message: "Route not found" }, requestId);
    } catch (err) {
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
          detail: process.env.NODE_ENV === "production" ? undefined : err.message,
        },
        requestId,
      );
    }
  };
}
