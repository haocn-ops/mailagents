import { createAdminService } from "../services/admin-service.js";
import { createAdminResponses } from "./responses.js";
import {
  parseAdminBucket,
  parseAdminPathParam,
  parseLimitSettingsPatch,
  parseMailboxFreezeBody,
  parseRiskPolicyBody,
} from "./validation.js";

export function createAdminRouteHandler({
  store,
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
  const responses = createAdminResponses({ jsonResponse });

  return async function handleAdminRoute({ method, path, request, requestId, requestUrl }) {
    if (!path.startsWith("/v1/admin/")) return null;

    const auth = await requireAdminAuth(request, requestId);
    if (!auth.ok) return auth.response;
    const actorDid = auth.actorDid;

    if (method === "GET" && path === "/v1/admin/settings/limits") {
      return responses.ok(requestId, adminService.getLimitSettings());
    }

    if (method === "PATCH" && path === "/v1/admin/settings/limits") {
      const body = await readJsonBody(request);
      const parsed = parseLimitSettingsPatch(body, {
        overageChargeUsdc: getOverageChargeUsdc(),
        agentAllocateHourlyLimit: getAgentAllocateHourlyLimit(),
      });
      if (!parsed.ok) {
        return responses.badRequest(requestId, parsed.message);
      }

      const result = await adminService.updateLimitSettings({
        overageChargeUsdc: parsed.overageChargeUsdc,
        agentAllocateHourlyLimit: parsed.agentAllocateHourlyLimit,
      });
      return responses.ok(requestId, result);
    }

    const paging = parsePaging(requestUrl);

    if (method === "GET" && path === "/v1/admin/overview/metrics") {
      const metrics = await adminService.adminOverviewMetrics();
      return responses.ok(requestId, metrics);
    }

    if (method === "GET" && path === "/v1/admin/overview/timeseries") {
      const bucketResult = parseAdminBucket(requestUrl.searchParams.get("bucket"));
      if (!bucketResult.ok) {
        return responses.badRequest(requestId, bucketResult.message);
      }
      const points = await adminService.adminOverviewTimeseries({
        from: requestUrl.searchParams.get("from"),
        to: requestUrl.searchParams.get("to"),
        bucket: bucketResult.value,
      });
      return responses.ok(requestId, points);
    }

    if (method === "GET" && path === "/v1/admin/tenants") {
      if (!paging.ok) return responses.badRequest(requestId, paging.message);
      const status = requestUrl.searchParams.get("status");
      const result = await adminService.adminListTenants({ page: paging.page, pageSize: paging.pageSize, status });
      return responses.ok(requestId, result);
    }

    if (path.startsWith("/v1/admin/tenants/")) {
      const tenantIdResult = parseAdminPathParam(path, {
        prefix: "/v1/admin/tenants/",
        name: "tenant_id",
      });
      if (!tenantIdResult.ok) {
        return responses.badRequest(requestId, tenantIdResult.message);
      }
      const tenantId = tenantIdResult.value;

      if (method === "GET") {
        const tenant = await adminService.adminGetTenant(tenantId);
        if (!tenant) {
          return responses.notFound(requestId, "Tenant not found");
        }
        return responses.ok(requestId, tenant);
      }

      if (method === "PATCH") {
        const body = await readJsonBody(request);
        const tenant = await adminService.adminPatchTenant(tenantId, body, { actorDid, requestId });
        if (!tenant) {
          return responses.notFound(requestId, "Tenant not found");
        }
        return responses.ok(requestId, tenant);
      }
    }

    if (method === "GET" && path === "/v1/admin/mailboxes") {
      if (!paging.ok) return responses.badRequest(requestId, paging.message);
      const result = await adminService.adminListMailboxes({
        page: paging.page,
        pageSize: paging.pageSize,
        status: requestUrl.searchParams.get("status"),
        tenantId: requestUrl.searchParams.get("tenant_id"),
      });
      return responses.ok(requestId, result);
    }

    if (path.startsWith("/v1/admin/mailboxes/") && path.endsWith("/freeze") && method === "POST") {
      const mailboxIdResult = parseAdminPathParam(path, {
        prefix: "/v1/admin/mailboxes/",
        suffix: "/freeze",
        name: "mailbox_id",
      });
      if (!mailboxIdResult.ok) {
        return responses.badRequest(requestId, mailboxIdResult.message);
      }
      const body = await readJsonBody(request);
      const parsed = parseMailboxFreezeBody(body);
      if (!parsed.ok) {
        return responses.badRequest(requestId, parsed.message);
      }
      const result = await adminService.adminFreezeMailbox(mailboxIdResult.value, {
        reason: parsed.reason,
        actorDid,
        requestId,
      });
      if (!result) {
        return responses.notFound(requestId, "Mailbox not found");
      }
      return responses.ok(requestId, result);
    }

    if (path.startsWith("/v1/admin/mailboxes/") && path.endsWith("/release") && method === "POST") {
      const mailboxIdResult = parseAdminPathParam(path, {
        prefix: "/v1/admin/mailboxes/",
        suffix: "/release",
        name: "mailbox_id",
      });
      if (!mailboxIdResult.ok) {
        return responses.badRequest(requestId, mailboxIdResult.message);
      }
      const result = await adminService.adminReleaseMailbox(mailboxIdResult.value, { actorDid, requestId });
      if (!result) {
        return responses.notFound(requestId, "Mailbox not found");
      }
      return responses.ok(requestId, result);
    }

    if (method === "GET" && path === "/v1/admin/messages") {
      if (!paging.ok) return responses.badRequest(requestId, paging.message);
      const result = await adminService.adminListMessages({
        page: paging.page,
        pageSize: paging.pageSize,
        mailboxId: requestUrl.searchParams.get("mailbox_id"),
        parsedStatus: requestUrl.searchParams.get("parsed_status"),
      });
      return responses.ok(requestId, result);
    }

    if (method === "GET" && path === "/v1/admin/send-attempts") {
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

    if (path.startsWith("/v1/admin/messages/") && path.endsWith("/reparse") && method === "POST") {
      const messageIdResult = parseAdminPathParam(path, {
        prefix: "/v1/admin/messages/",
        suffix: "/reparse",
        name: "message_id",
      });
      if (!messageIdResult.ok) {
        return responses.badRequest(requestId, messageIdResult.message);
      }
      const result = await adminService.adminReparseMessage(messageIdResult.value, { actorDid, requestId });
      if (!result) {
        return responses.notFound(requestId, "Message not found");
      }
      return responses.accepted(requestId, result);
    }

    if (path.startsWith("/v1/admin/messages/") && path.endsWith("/replay-webhook") && method === "POST") {
      const messageIdResult = parseAdminPathParam(path, {
        prefix: "/v1/admin/messages/",
        suffix: "/replay-webhook",
        name: "message_id",
      });
      if (!messageIdResult.ok) {
        return responses.badRequest(requestId, messageIdResult.message);
      }
      const result = await adminService.adminReplayMessageWebhook(messageIdResult.value, { actorDid, requestId });
      if (!result) {
        return responses.notFound(requestId, "Message not found");
      }
      return responses.accepted(requestId, result);
    }

    if (method === "GET" && path === "/v1/admin/webhooks") {
      if (!paging.ok) return responses.badRequest(requestId, paging.message);
      const result = await adminService.adminListWebhooks({ page: paging.page, pageSize: paging.pageSize });
      return responses.ok(requestId, result);
    }

    if (method === "GET" && path === "/v1/admin/webhook-deliveries") {
      if (!paging.ok) return responses.badRequest(requestId, paging.message);
      const result = await adminService.adminListWebhookDeliveries({
        page: paging.page,
        pageSize: paging.pageSize,
        tenantId: requestUrl.searchParams.get("tenant_id"),
        webhookId: requestUrl.searchParams.get("webhook_id"),
      });
      return responses.ok(requestId, result);
    }

    if (path.startsWith("/v1/admin/webhooks/") && path.endsWith("/replay") && method === "POST") {
      const webhookIdResult = parseAdminPathParam(path, {
        prefix: "/v1/admin/webhooks/",
        suffix: "/replay",
        name: "webhook_id",
      });
      if (!webhookIdResult.ok) {
        return responses.badRequest(requestId, webhookIdResult.message);
      }
      const body = await readJsonBody(request);
      const result = await adminService.adminReplayWebhook(webhookIdResult.value, {
        from: body.from,
        to: body.to,
        actorDid,
        requestId,
      });
      if (!result) {
        return responses.notFound(requestId, "Webhook not found");
      }
      return responses.accepted(requestId, result);
    }

    if (path.startsWith("/v1/admin/webhooks/") && path.endsWith("/rotate-secret") && method === "POST") {
      const webhookIdResult = parseAdminPathParam(path, {
        prefix: "/v1/admin/webhooks/",
        suffix: "/rotate-secret",
        name: "webhook_id",
      });
      if (!webhookIdResult.ok) {
        return responses.badRequest(requestId, webhookIdResult.message);
      }
      const result = await adminService.adminRotateWebhookSecret(webhookIdResult.value, { actorDid, requestId });
      if (!result) {
        return responses.notFound(requestId, "Webhook not found");
      }
      return responses.ok(requestId, result);
    }

    if (method === "GET" && path === "/v1/admin/invoices") {
      if (!paging.ok) return responses.badRequest(requestId, paging.message);
      const result = await adminService.adminListInvoices({
        page: paging.page,
        pageSize: paging.pageSize,
        period: requestUrl.searchParams.get("period"),
      });
      return responses.ok(requestId, result);
    }

    if (path.startsWith("/v1/admin/invoices/") && path.endsWith("/issue") && method === "POST") {
      const invoiceIdResult = parseAdminPathParam(path, {
        prefix: "/v1/admin/invoices/",
        suffix: "/issue",
        name: "invoice_id",
      });
      if (!invoiceIdResult.ok) {
        return responses.badRequest(requestId, invoiceIdResult.message);
      }
      const result = await adminService.adminIssueInvoice(invoiceIdResult.value, { actorDid, requestId });
      if (!result) {
        return responses.notFound(requestId, "Invoice not found");
      }
      return responses.ok(requestId, result);
    }

    if (method === "GET" && path === "/v1/admin/risk/events") {
      if (!paging.ok) return responses.badRequest(requestId, paging.message);
      const result = await adminService.adminListRiskEvents({ page: paging.page, pageSize: paging.pageSize });
      return responses.ok(requestId, result);
    }

    if (method === "POST" && path === "/v1/admin/risk/policies") {
      const body = await readJsonBody(request);
      const parsed = parseRiskPolicyBody(body);
      if (!parsed.ok) {
        return responses.badRequest(requestId, parsed.message);
      }
      const result = await adminService.adminUpsertRiskPolicy({
        policyType: parsed.policyType,
        value: parsed.value,
        action: parsed.action,
        actorDid,
        requestId,
      });
      return responses.ok(requestId, result);
    }

    if (method === "GET" && path === "/v1/admin/audit/logs") {
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

    return null;
  };
}
