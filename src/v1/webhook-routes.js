import { parseInvoiceId, parseWebhookBody } from "./validation.js";

export function createV1WebhookRouteHandler({
  webhookService,
  authz,
  metering,
  responses,
  readJsonBody,
}) {
  return async function handleV1WebhookRoute({ method, path, request, requestId, requestUrl }) {
    if (method === "POST" && path === "/v1/webhooks") {
      const auth = await authz.requireTenant(request, requestId);
      if (!auth.ok) return auth.response;

      const access = await authz.requireAccess({
        request,
        requestId,
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v1/webhooks",
      });
      if (!access.ok) return access.response;

      const body = await readJsonBody(request);
      const parsed = parseWebhookBody(body);
      if (!parsed.ok) {
        return responses.badRequest(requestId, parsed.message);
      }

      const webhook = await webhookService.createWebhook({
        tenantId: auth.payload.tenant_id,
        eventTypes: parsed.eventTypes,
        targetUrl: parsed.targetUrl,
        secret: parsed.secret,
      });

      await metering.recordUsage({ auth, endpoint: "POST /v1/webhooks", requestId, access });
      return responses.ok(requestId, webhook);
    }

    if (method === "GET" && path === "/v1/webhooks") {
      const auth = await authz.requireTenant(request, requestId);
      if (!auth.ok) return auth.response;

      const items = await webhookService.listWebhooks(auth.payload.tenant_id);
      return responses.okItems(requestId, items);
    }

    if (method === "GET" && path === "/v1/usage/summary") {
      const auth = await authz.requireTenant(request, requestId);
      if (!auth.ok) return auth.response;

      const period = requestUrl.searchParams.get("period");
      const summary = await webhookService.getUsageSummary(auth.payload.tenant_id, period);
      if (!summary) {
        return responses.badRequest(requestId, "period must match YYYY-MM");
      }
      return responses.ok(requestId, summary);
    }

    if (method === "GET" && path.startsWith("/v1/billing/invoices/")) {
      const auth = await authz.requireTenant(request, requestId);
      if (!auth.ok) return auth.response;

      const invoiceResult = parseInvoiceId(path);
      if (!invoiceResult.ok) {
        return responses.badRequest(requestId, invoiceResult.message);
      }

      const invoice = await webhookService.getInvoice(auth.payload.tenant_id, invoiceResult.invoiceId);
      if (!invoice) {
        return responses.notFound(requestId, "Invoice not found");
      }
      return responses.ok(requestId, invoice);
    }

    if (method === "GET" && path === "/v1/billing/invoices") {
      const auth = await authz.requireTenant(request, requestId);
      if (!auth.ok) return auth.response;

      const period = requestUrl.searchParams.get("period");
      const items = await webhookService.listInvoices(auth.payload.tenant_id, period);
      return responses.okItems(requestId, items);
    }

    return null;
  };
}
