import { createV2BillingService } from "../services/v2-billing-service.js";
import { createV2Authz } from "./authz.js";
import { createV2Responses } from "./responses.js";
import { parseRequiredPathParam } from "./validation.js";

export function createV2BillingRouteHandler({
  store,
  requireAuth,
  evaluateAccess,
  jsonResponse,
}) {
  const billingService = createV2BillingService({ store });
  const authz = createV2Authz({ requireAuth, evaluateAccess });
  const responses = createV2Responses({ jsonResponse });

  return async function handleV2BillingRoute({ method, path, request, requestId, requestUrl }) {
    if (!path.startsWith("/v2/usage") && !path.startsWith("/v2/billing")) return null;

    if (method === "GET" && path === "/v2/usage/summary") {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const period = requestUrl.searchParams.get("period");
      const summary = await billingService.getUsageSummary({
        tenantId: auth.payload.tenant_id,
        period,
      });
      if (!summary) {
        return responses.badRequest(requestId, "period must match YYYY-MM");
      }
      return responses.ok(requestId, summary);
    }

    if (method === "GET" && path.startsWith("/v2/billing/invoices/")) {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const invoiceIdResult = parseRequiredPathParam(path, {
        prefix: "/v2/billing/invoices/",
        name: "invoice_id",
      });
      if (!invoiceIdResult.ok) {
        return responses.badRequest(requestId, invoiceIdResult.error);
      }

      const invoice = await billingService.getInvoice({
        tenantId: auth.payload.tenant_id,
        invoiceId: invoiceIdResult.value,
      });
      if (!invoice) {
        return responses.notFound(requestId, "Invoice not found");
      }
      return responses.ok(requestId, invoice);
    }

    if (method === "GET" && path === "/v2/billing/invoices") {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const period = requestUrl.searchParams.get("period");
      const items = await billingService.listInvoices({
        tenantId: auth.payload.tenant_id,
        period,
      });
      return responses.okItems(requestId, items);
    }

    return null;
  };
}
