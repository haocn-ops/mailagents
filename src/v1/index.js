import { createV1MailboxService } from "../services/v1-mailbox-service.js";
import { createV1MessageService } from "../services/v1-message-service.js";
import { createV1WebhookService } from "../services/v1-webhook-service.js";

export function createV1RouteHandler({
  store,
  mailBackend,
  requireAuth,
  evaluateAccess,
  jsonResponse,
  readJsonBody,
  getOverageChargeUsdc,
}) {
  const mailboxService = createV1MailboxService({ store, mailBackend });
  const messageService = createV1MessageService({ store, mailBackend });
  const webhookService = createV1WebhookService({ store });

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

      let result;
      try {
        result = await mailboxService.allocateMailbox({
          tenantId: auth.payload.tenant_id,
          agentId,
          purpose,
          ttlHours,
        });
      } catch (err) {
        return jsonResponse(
          502,
          { error: "mail_backend_error", message: err.message || "Mail backend provisioning failed" },
          requestId,
        );
      }

      if (!result) {
        return jsonResponse(409, { error: "no_available_mailbox", message: "No available mailbox for current tenant" }, requestId);
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

      return jsonResponse(200, result, requestId);
    }

    if (method === "POST" && path === "/v1/mailboxes/release") {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const body = await readJsonBody(request);
      const mailboxId = String(body.mailbox_id || "");
      if (!mailboxId) {
        return jsonResponse(400, { error: "bad_request", message: "mailbox_id is required" }, requestId);
      }

      let result;
      try {
        result = await mailboxService.releaseMailbox({
          tenantId: auth.payload.tenant_id,
          mailboxId,
        });
      } catch (err) {
        return jsonResponse(
          502,
          { error: "mail_backend_error", message: err.message || "Mail backend release failed" },
          requestId,
        );
      }
      if (!result) {
        return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
      }

      await store.recordUsage({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v1/mailboxes/release",
        quantity: 1,
        requestId,
      });
      return jsonResponse(200, result, requestId);
    }

    if (method === "POST" && path === "/v1/mailboxes/credentials/reset") {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const body = await readJsonBody(request);
      const mailboxId = String(body.mailbox_id || "");
      if (!mailboxId) {
        return jsonResponse(400, { error: "bad_request", message: "mailbox_id is required" }, requestId);
      }

      const credentials = await mailboxService.resetMailboxCredentials({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        mailboxId,
      });
      if (!credentials) {
        return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
      }

      await store.recordUsage({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v1/mailboxes/credentials/reset",
        quantity: 1,
        requestId,
      });

      return jsonResponse(200, credentials, requestId);
    }

    if (method === "GET" && path === "/v1/mailboxes") {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const items = await mailboxService.listMailboxes(auth.payload.tenant_id);
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

      const messages = await messageService.getLatestMessages({
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

      let delivery;
      try {
        delivery = await messageService.sendMessage({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          mailboxId,
          recipients,
          subject,
          text,
          html,
          mailboxPassword,
        });
      } catch (err) {
        return jsonResponse(
          502,
          { error: "mail_backend_error", message: err.message || "Mail backend send failed" },
          requestId,
        );
      }
      if (!delivery) {
        return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
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

      return jsonResponse(200, delivery, requestId);
    }

    if (method === "GET" && path.startsWith("/v1/messages/")) {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const messageId = path.replace("/v1/messages/", "").trim();
      if (!messageId) {
        return jsonResponse(400, { error: "bad_request", message: "message_id is required" }, requestId);
      }

      const message = await messageService.getMessageDetail(auth.payload.tenant_id, messageId);
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

      const webhook = await webhookService.createWebhook({
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

      return jsonResponse(200, webhook, requestId);
    }

    if (method === "GET" && path === "/v1/webhooks") {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const items = await webhookService.listWebhooks(auth.payload.tenant_id);
      return jsonResponse(200, { items }, requestId);
    }

    if (method === "GET" && path === "/v1/usage/summary") {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const period = requestUrl.searchParams.get("period");
      const summary = await webhookService.getUsageSummary(auth.payload.tenant_id, period);
      if (!summary) {
        return jsonResponse(400, { error: "bad_request", message: "period must match YYYY-MM" }, requestId);
      }
      return jsonResponse(200, summary, requestId);
    }

    if (method === "GET" && path.startsWith("/v1/billing/invoices/")) {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const invoiceId = path.replace("/v1/billing/invoices/", "").trim();
      if (!invoiceId) {
        return jsonResponse(400, { error: "bad_request", message: "invoice_id is required" }, requestId);
      }

      const invoice = await webhookService.getInvoice(auth.payload.tenant_id, invoiceId);
      if (!invoice) {
        return jsonResponse(404, { error: "not_found", message: "Invoice not found" }, requestId);
      }
      return jsonResponse(200, invoice, requestId);
    }

    if (method === "GET" && path === "/v1/billing/invoices") {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const period = requestUrl.searchParams.get("period");
      const items = await webhookService.listInvoices(auth.payload.tenant_id, period);
      return jsonResponse(200, { items }, requestId);
    }

    return null;
  };
}
