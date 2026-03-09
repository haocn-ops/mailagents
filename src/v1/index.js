import { parsePeriod } from "../utils.js";

export function createV1RouteHandler({
  store,
  mailBackend,
  requireAuth,
  evaluateAccess,
  jsonResponse,
  readJsonBody,
  getOverageChargeUsdc,
}) {
  return async function handleV1Route({ method, path, request, requestId, requestUrl }) {
    if (!path.startsWith("/v1/")) return null;

    if (method === "POST" && path === "/v1/mailboxes/allocate") {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;

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

      const access = await evaluateAccess({
        request,
        requestId,
        tenantId: auth.payload.tenant_id,
        agentId,
        endpoint: "POST /v1/mailboxes/allocate",
        checkAllocateHourly: true,
      });
      if (!access.ok) return access.response;

      const result = await store.allocateMailbox({
        tenantId: auth.payload.tenant_id,
        agentId,
        purpose,
        ttlHours,
      });

      if (!result) {
        return jsonResponse(409, { error: "no_available_mailbox", message: "No available mailbox for current tenant" }, requestId);
      }

      let provider = null;
      try {
        provider = await mailBackend.provisionMailbox({
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
      if (access.requiresCharge) {
        await store.recordOverageCharge({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          endpoint: "POST /v1/mailboxes/allocate",
          reasons: access.reasons,
          amountUsdc: getOverageChargeUsdc(),
          requestId,
        });
      }

      return jsonResponse(
        200,
        {
          mailbox_id: result.mailbox.id,
          address: result.mailbox.address,
          lease_expires_at: result.lease.expiresAt,
          webmail_login: provider?.credentials?.login || null,
          webmail_password: provider?.credentials?.password || null,
          webmail_url: provider?.credentials?.webmailUrl || null,
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

      return jsonResponse(200, { mailbox_id: mailboxId, status: "released" }, requestId);
    }

    if (method === "POST" && path === "/v1/mailboxes/credentials/reset") {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const body = await readJsonBody(request);
      const mailboxId = String(body.mailbox_id || "");
      if (!mailboxId) {
        return jsonResponse(400, { error: "bad_request", message: "mailbox_id is required" }, requestId);
      }

      const mailbox = await store.getTenantMailbox(auth.payload.tenant_id, mailboxId);
      if (!mailbox) {
        return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
      }

      const credentials = await mailBackend.issueMailboxCredentials({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        mailboxId,
        address: mailbox.address,
        providerRef: mailbox.providerRef || null,
      });

      await store.recordUsage({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v1/mailboxes/credentials/reset",
        quantity: 1,
        requestId,
      });

      return jsonResponse(
        200,
        {
          mailbox_id: mailbox.id,
          address: mailbox.address,
          webmail_login: credentials?.login || mailbox.address,
          webmail_password: credentials?.password || null,
          webmail_url: credentials?.webmailUrl || null,
        },
        requestId,
      );
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
      const access = await evaluateAccess({
        request,
        requestId,
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "GET /v1/messages/latest",
      });
      if (!access.ok) return access.response;

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
      if (access.requiresCharge) {
        await store.recordOverageCharge({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          endpoint: "GET /v1/messages/latest",
          reasons: access.reasons,
          amountUsdc: getOverageChargeUsdc(),
          requestId,
        });
      }

      return jsonResponse(200, { messages }, requestId);
    }

    if (method === "POST" && path === "/v1/messages/send") {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;
      const access = await evaluateAccess({
        request,
        requestId,
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v1/messages/send",
      });
      if (!access.ok) return access.response;

      const body = await readJsonBody(request);
      const mailboxId = String(body.mailbox_id || "").trim();
      const recipients = Array.isArray(body.to)
        ? body.to.map((item) => String(item || "").trim()).filter(Boolean)
        : String(body.to || "").trim()
          ? [String(body.to || "").trim()]
          : [];
      const subject = String(body.subject || "").trim();
      const text = String(body.text || "");
      const html = String(body.html || "");
      const mailboxPassword = String(body.mailbox_password || "").trim();

      if (!mailboxId || !recipients.length || !subject || !mailboxPassword || (!text && !html)) {
        return jsonResponse(
          400,
          { error: "bad_request", message: "mailbox_id, to, subject, mailbox_password, and text or html are required" },
          requestId,
        );
      }

      const mailbox = await store.getTenantMailbox(auth.payload.tenant_id, mailboxId);
      if (!mailbox) {
        return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
      }

      let delivery;
      try {
        delivery = await mailBackend.sendMailboxMessage({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          mailboxId,
          address: mailbox.address,
          password: mailboxPassword,
          to: recipients,
          subject,
          text,
          html,
        });
      } catch (err) {
        return jsonResponse(
          502,
          { error: "mail_backend_error", message: err.message || "Mail backend send failed" },
          requestId,
        );
      }

      await store.recordUsage({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v1/messages/send",
        quantity: 1,
        requestId,
      });
      if (access.requiresCharge) {
        await store.recordOverageCharge({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          endpoint: "POST /v1/messages/send",
          reasons: access.reasons,
          amountUsdc: getOverageChargeUsdc(),
          requestId,
        });
      }

      return jsonResponse(
        200,
        {
          mailbox_id: mailbox.id,
          from: mailbox.address,
          accepted: delivery?.accepted || [],
          rejected: delivery?.rejected || [],
          message_id: delivery?.messageId || null,
          envelope: delivery?.envelope || null,
          response: delivery?.response || null,
        },
        requestId,
      );
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
      const access = await evaluateAccess({
        request,
        requestId,
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v1/webhooks",
      });
      if (!access.ok) return access.response;

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
      if (access.requiresCharge) {
        await store.recordOverageCharge({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          endpoint: "POST /v1/webhooks",
          reasons: access.reasons,
          amountUsdc: getOverageChargeUsdc(),
          requestId,
        });
      }

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

    return null;
  };
}
