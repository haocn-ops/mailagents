import { parseAdminPathParam } from "../admin/validation.js";
import { parseLimitSettingsPatch } from "../admin/validation.js";
import { createAdminService } from "../services/admin-service.js";
import { createV2Responses } from "./responses.js";

export function createV2AdminRouteHandler({
  store,
  queue,
  requireAdminAuth,
  jsonResponse,
  readJsonBody,
  parsePaging,
  getOverageChargeUsdc,
  getAgentAllocateHourlyLimit,
  updateRuntimeSettings,
}) {
  const adminService = createAdminService({
    store,
    getOverageChargeUsdc,
    getAgentAllocateHourlyLimit,
    updateRuntimeSettings,
  });
  const responses = createV2Responses({ jsonResponse });

  return async function handleV2AdminRoute({ method, path, request, requestId, requestUrl }) {
    if (!path.startsWith("/v2/admin/")) return null;

    const auth = await requireAdminAuth(request, requestId);
    if (!auth.ok) return auth.response;

    const paging = parsePaging(requestUrl);

    if (method === "GET" && path === "/v2/admin/overview/metrics") {
      const metrics = await adminService.adminOverviewMetrics();
      return responses.ok(requestId, metrics);
    }

    if (method === "GET" && path === "/v2/admin/settings/runtime") {
      return responses.ok(requestId, adminService.getLimitSettings());
    }

    if (method === "PATCH" && path === "/v2/admin/settings/runtime") {
      const body = await readJsonBody(request);
      const parsed = parseLimitSettingsPatch(body, {
        overageChargeUsdc: getOverageChargeUsdc(),
        agentAllocateHourlyLimit: getAgentAllocateHourlyLimit(),
      });
      if (!parsed.ok) return responses.badRequest(requestId, parsed.message);
      const result = await adminService.updateLimitSettings({
        overageChargeUsdc: parsed.overageChargeUsdc,
        agentAllocateHourlyLimit: parsed.agentAllocateHourlyLimit,
      });
      return responses.ok(requestId, result);
    }

    if (method === "GET" && path === "/v2/admin/messages") {
      if (!paging.ok) return responses.badRequest(requestId, paging.message);
      const result = await adminService.adminListMessages({
        page: paging.page,
        pageSize: paging.pageSize,
        tenantId: requestUrl.searchParams.get("tenant_id"),
        mailboxId: requestUrl.searchParams.get("mailbox_id"),
        parsedStatus: requestUrl.searchParams.get("parsed_status"),
      });
      return responses.ok(requestId, result);
    }

    if (method === "GET" && path === "/v2/admin/tenants") {
      if (!paging.ok) return responses.badRequest(requestId, paging.message);
      const result = await adminService.adminListTenants({
        page: paging.page,
        pageSize: paging.pageSize,
        status: requestUrl.searchParams.get("status"),
      });
      return responses.ok(requestId, result);
    }

    if (method === "GET" && path.startsWith("/v2/admin/tenants/")) {
      const tenantIdResult = parseAdminPathParam(path, {
        prefix: "/v2/admin/tenants/",
        name: "tenant_id",
      });
      if (!tenantIdResult.ok) return responses.badRequest(requestId, tenantIdResult.message);
      const tenant = await adminService.adminGetTenant(tenantIdResult.value);
      if (!tenant) return responses.notFound(requestId, "Tenant not found");
      return responses.ok(requestId, tenant);
    }

    if (method === "PATCH" && path.startsWith("/v2/admin/tenants/")) {
      const tenantIdResult = parseAdminPathParam(path, {
        prefix: "/v2/admin/tenants/",
        name: "tenant_id",
      });
      if (!tenantIdResult.ok) return responses.badRequest(requestId, tenantIdResult.message);
      const body = await readJsonBody(request);
      const tenant = await adminService.adminPatchTenant(tenantIdResult.value, body, {
        actorDid: auth.actorDid,
        requestId,
      });
      if (!tenant) return responses.notFound(requestId, "Tenant not found");
      return responses.ok(requestId, tenant);
    }

    if (method === "GET" && path === "/v2/admin/mailboxes/accounts") {
      if (!paging.ok) return responses.badRequest(requestId, paging.message);
      const result = await adminService.adminListMailboxes({
        page: paging.page,
        pageSize: paging.pageSize,
        status: requestUrl.searchParams.get("status"),
        tenantId: requestUrl.searchParams.get("tenant_id"),
      });
      return responses.ok(requestId, result);
    }

    if (method === "GET" && path.startsWith("/v2/admin/mailboxes/accounts/")) {
      const accountIdResult = parseAdminPathParam(path, {
        prefix: "/v2/admin/mailboxes/accounts/",
        name: "account_id",
      });
      if (!accountIdResult.ok) return responses.badRequest(requestId, accountIdResult.message);
      const account = await adminService.adminGetMailboxAccount(accountIdResult.value);
      if (!account) return responses.notFound(requestId, "Mailbox account not found");
      return responses.ok(requestId, account);
    }

    if (method === "GET" && path === "/v2/admin/mailboxes/leases") {
      if (!paging.ok) return responses.badRequest(requestId, paging.message);
      const result = await adminService.adminListMailboxes({
        page: paging.page,
        pageSize: paging.pageSize,
        status: requestUrl.searchParams.get("status"),
        tenantId: requestUrl.searchParams.get("tenant_id"),
      });
      return responses.ok(requestId, result);
    }

    if (method === "GET" && path === "/v2/admin/send-attempts") {
      if (!paging.ok) return responses.badRequest(requestId, paging.message);
      const result = await adminService.adminListSendAttempts({
        page: paging.page,
        pageSize: paging.pageSize,
        tenantId: requestUrl.searchParams.get("tenant_id"),
        mailboxId: requestUrl.searchParams.get("mailbox_id"),
        submissionStatus: requestUrl.searchParams.get("submission_status"),
      });
      return responses.ok(requestId, result);
    }

    if (method === "GET" && path === "/v2/admin/webhook-deliveries") {
      if (!paging.ok) return responses.badRequest(requestId, paging.message);
      const result = await adminService.adminListWebhookDeliveries({
        page: paging.page,
        pageSize: paging.pageSize,
        tenantId: requestUrl.searchParams.get("tenant_id"),
        webhookId: requestUrl.searchParams.get("webhook_id"),
      });
      return responses.ok(requestId, result);
    }

    if (method === "GET" && path === "/v2/admin/webhooks") {
      if (!paging.ok) return responses.badRequest(requestId, paging.message);
      const result = await adminService.adminListWebhooks({
        page: paging.page,
        pageSize: paging.pageSize,
        tenantId: requestUrl.searchParams.get("tenant_id"),
        webhookId: requestUrl.searchParams.get("webhook_id"),
      });
      return responses.ok(requestId, result);
    }

    if (method === "GET" && path === "/v2/admin/audit/logs") {
      if (!paging.ok) return responses.badRequest(requestId, paging.message);
      const result = await adminService.adminListAuditLogs({
        page: paging.page,
        pageSize: paging.pageSize,
        requestId: requestUrl.searchParams.get("request_id"),
        tenantId: requestUrl.searchParams.get("tenant_id"),
        actorDid: requestUrl.searchParams.get("actor_did"),
      });
      return responses.ok(requestId, result);
    }

    if (method === "GET" && path === "/v2/admin/billing/invoices") {
      if (!paging.ok) return responses.badRequest(requestId, paging.message);
      const result = await adminService.adminListInvoices({
        page: paging.page,
        pageSize: paging.pageSize,
        period: requestUrl.searchParams.get("period"),
      });
      return responses.ok(requestId, result);
    }

    if (method === "GET" && path === "/v2/admin/risk/events") {
      if (!paging.ok) return responses.badRequest(requestId, paging.message);
      const result = await adminService.adminListRiskEvents({
        page: paging.page,
        pageSize: paging.pageSize,
      });
      return responses.ok(requestId, result);
    }

    if (method === "GET" && path === "/v2/admin/jobs") {
      const items = typeof queue?.listJobs === "function" ? queue.listJobs() : [];
      return responses.ok(requestId, { items });
    }

    return null;
  };
}
