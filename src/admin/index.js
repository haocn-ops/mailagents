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
  return async function handleAdminRoute({ method, path, request, requestId, requestUrl }) {
    if (!path.startsWith("/v1/admin/")) return null;

    const auth = await requireAdminAuth(request, requestId);
    if (!auth.ok) return auth.response;
    const actorDid = auth.actorDid;

    if (method === "GET" && path === "/v1/admin/settings/limits") {
      return jsonResponse(
        200,
        {
          overage_charge_usdc: getOverageChargeUsdc(),
          agent_allocate_hourly_limit: getAgentAllocateHourlyLimit(),
        },
        requestId,
      );
    }

    if (method === "PATCH" && path === "/v1/admin/settings/limits") {
      const body = await readJsonBody(request);
      const nextOverage =
        body.overage_charge_usdc === undefined ? getOverageChargeUsdc() : Number(body.overage_charge_usdc);
      const nextAgentAllocateHourlyLimit =
        body.agent_allocate_hourly_limit === undefined
          ? getAgentAllocateHourlyLimit()
          : Number(body.agent_allocate_hourly_limit);

      if (!Number.isFinite(nextOverage) || nextOverage < 0) {
        return jsonResponse(400, { error: "bad_request", message: "overage_charge_usdc must be >= 0" }, requestId);
      }
      if (!Number.isInteger(nextAgentAllocateHourlyLimit) || nextAgentAllocateHourlyLimit < 0) {
        return jsonResponse(
          400,
          { error: "bad_request", message: "agent_allocate_hourly_limit must be an integer >= 0" },
          requestId,
        );
      }

      await updateRuntimeSettings({
        overageChargeUsdc: Number(nextOverage.toFixed(6)),
        agentAllocateHourlyLimit: nextAgentAllocateHourlyLimit,
      });

      return jsonResponse(
        200,
        {
          status: "updated",
          overage_charge_usdc: getOverageChargeUsdc(),
          agent_allocate_hourly_limit: getAgentAllocateHourlyLimit(),
        },
        requestId,
      );
    }

    const paging = parsePaging(requestUrl);

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

    return null;
  };
}
