import { createV2WebhookService } from "../services/v2-webhook-service.js";
import { createV2Authz } from "./authz.js";
import { createV2Metering } from "./metering.js";
import { parseRequiredPathParam } from "./validation.js";

export function createV2WebhookRouteHandler({
  store,
  requireAuth,
  evaluateAccess,
  jsonResponse,
  readJsonBody,
  getOverageChargeUsdc,
}) {
  const webhookService = createV2WebhookService({ store });
  const authz = createV2Authz({ requireAuth, evaluateAccess });
  const metering = createV2Metering({ store, getOverageChargeUsdc });

  return async function handleV2WebhookRoute({ method, path, request, requestId, requestUrl }) {
    if (!path.startsWith("/v2/webhooks") && !path.startsWith("/v2/usage") && !path.startsWith("/v2/billing")) return null;

    if (method === "POST" && path === "/v2/webhooks") {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;
      const access = await authz.requireTenantAccess({
        request,
        requestId,
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v2/webhooks",
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

      await metering.recordUsageAndCharge({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v2/webhooks",
        requestId,
        access,
      });

      return jsonResponse(201, webhook, requestId);
    }

    if (method === "GET" && path === "/v2/webhooks") {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;
      const items = await webhookService.listWebhooks(auth.payload.tenant_id);
      return jsonResponse(200, { items }, requestId);
    }

    if (method === "POST" && path.startsWith("/v2/webhooks/") && path.endsWith("/rotate-secret")) {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const webhookIdResult = parseRequiredPathParam(path, {
        prefix: "/v2/webhooks/",
        suffix: "/rotate-secret",
        name: "webhook_id",
      });
      if (!webhookIdResult.ok) {
        return jsonResponse(400, { error: "bad_request", message: webhookIdResult.error }, requestId);
      }
      const webhookId = webhookIdResult.value;
      const rotated = await webhookService.rotateWebhookSecret({
        tenantId: auth.payload.tenant_id,
        webhookId,
        actorDid: auth.payload.did,
        requestId,
      });
      if (!rotated) {
        return jsonResponse(404, { error: "not_found", message: "Webhook not found" }, requestId);
      }

      return jsonResponse(200, rotated, requestId);
    }

    if (method === "GET" && path === "/v2/webhooks/deliveries") {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const webhookId = requestUrl.searchParams.get("webhook_id");
      const items = await webhookService.listWebhookDeliveries({
        tenantId: auth.payload.tenant_id,
        webhookId,
      });
      return jsonResponse(200, { items }, requestId);
    }

    if (method === "GET" && path === "/v2/usage/summary") {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const period = requestUrl.searchParams.get("period");
      const summary = await webhookService.getUsageSummary({
        tenantId: auth.payload.tenant_id,
        period,
      });
      if (!summary) {
        return jsonResponse(400, { error: "bad_request", message: "period must match YYYY-MM" }, requestId);
      }
      return jsonResponse(200, summary, requestId);
    }

    if (method === "GET" && path.startsWith("/v2/billing/invoices/")) {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const invoiceIdResult = parseRequiredPathParam(path, {
        prefix: "/v2/billing/invoices/",
        name: "invoice_id",
      });
      if (!invoiceIdResult.ok) {
        return jsonResponse(400, { error: "bad_request", message: invoiceIdResult.error }, requestId);
      }
      const invoiceId = invoiceIdResult.value;

      const invoice = await webhookService.getInvoice({
        tenantId: auth.payload.tenant_id,
        invoiceId,
      });
      if (!invoice) {
        return jsonResponse(404, { error: "not_found", message: "Invoice not found" }, requestId);
      }
      return jsonResponse(200, invoice, requestId);
    }

    if (method === "GET" && path === "/v2/billing/invoices") {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const period = requestUrl.searchParams.get("period");
      const items = await webhookService.listInvoices({
        tenantId: auth.payload.tenant_id,
        period,
      });
      return jsonResponse(200, { items }, requestId);
    }

    return null;
  };
}
