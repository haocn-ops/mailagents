function toV2MailboxAccount(mailbox, lease = null) {
  return {
    account_id: mailbox.mailbox_id,
    mailbox_id: mailbox.mailbox_id,
    address: mailbox.address,
    account_status: mailbox.status === "leased" ? "active" : mailbox.status,
    lease_status: lease?.status || null,
    lease_id: lease?.id || null,
    lease_expires_at: mailbox.lease_expires_at || lease?.expiresAt || null,
    provider_ref: mailbox.provider_ref || null,
    updated_at: mailbox.updated_at || null,
  };
}

function toV2MailboxLease(mailbox, lease) {
  return {
    lease_id: lease.id,
    mailbox_id: mailbox.mailbox_id,
    account_id: mailbox.mailbox_id,
    address: mailbox.address,
    agent_id: lease.agentId,
    purpose: lease.purpose,
    lease_status: lease.status,
    started_at: lease.startedAt,
    expires_at: lease.expiresAt,
    released_at: lease.releasedAt || null,
  };
}

export function createV2MailboxRouteHandler({
  store,
  mailBackend,
  requireAuth,
  evaluateAccess,
  jsonResponse,
  readJsonBody,
  getOverageChargeUsdc,
}) {
  return async function handleV2MailboxRoute({ method, path, request, requestId }) {
    if (!path.startsWith("/v2/mailboxes/")) return null;

    if (method === "GET" && path === "/v2/mailboxes/accounts") {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const mailboxes = await store.listTenantMailboxes(auth.payload.tenant_id);
      const items = [];
      for (const mailbox of mailboxes) {
        const lease = await store.getActiveLeaseByMailboxId(mailbox.mailbox_id);
        items.push(toV2MailboxAccount(mailbox, lease));
      }
      return jsonResponse(200, { items }, requestId);
    }

    if (method === "GET" && path === "/v2/mailboxes/leases") {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const mailboxes = await store.listTenantMailboxes(auth.payload.tenant_id);
      const items = [];
      for (const mailbox of mailboxes) {
        const lease = await store.getActiveLeaseByMailboxId(mailbox.mailbox_id);
        if (lease) items.push(toV2MailboxLease(mailbox, lease));
      }
      return jsonResponse(200, { items }, requestId);
    }

    if (method === "POST" && path === "/v2/mailboxes/leases") {
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
        endpoint: "POST /v2/mailboxes/leases",
        checkAllocateHourly: true,
        allocateHourlyEndpoints: ["POST /v1/mailboxes/allocate", "POST /v2/mailboxes/leases"],
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
        return jsonResponse(502, { error: "mail_backend_error", message: err.message || "Mail backend provisioning failed" }, requestId);
      }

      await store.recordUsage({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v2/mailboxes/leases",
        quantity: 1,
        requestId,
      });
      if (access.requiresCharge) {
        await store.recordOverageCharge({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          endpoint: "POST /v2/mailboxes/leases",
          reasons: access.reasons,
          amountUsdc: getOverageChargeUsdc(),
          requestId,
        });
      }

      return jsonResponse(
        201,
        {
          lease_id: result.lease.id,
          mailbox_id: result.mailbox.id,
          account_id: result.mailbox.id,
          address: result.mailbox.address,
          lease_status: result.lease.status,
          expires_at: result.lease.expiresAt,
          webmail_login: provider?.credentials?.login || null,
          webmail_password: provider?.credentials?.password || null,
          webmail_url: provider?.credentials?.webmailUrl || null,
        },
        requestId,
      );
    }

    if (method === "POST" && path.startsWith("/v2/mailboxes/leases/") && path.endsWith("/release")) {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const leaseId = path.slice("/v2/mailboxes/leases/".length, -"/release".length);
      const lease = await store.getTenantLeaseById(auth.payload.tenant_id, leaseId);
      if (!lease) {
        return jsonResponse(404, { error: "not_found", message: "Lease not found" }, requestId);
      }

      const result = await store.releaseMailbox({ tenantId: auth.payload.tenant_id, mailboxId: lease.mailboxId });
      if (!result) {
        return jsonResponse(404, { error: "not_found", message: "Lease not found" }, requestId);
      }

      try {
        await mailBackend.releaseMailbox({
          tenantId: auth.payload.tenant_id,
          mailboxId: lease.mailboxId,
          address: result.mailbox.address,
          providerRef: result.mailbox.providerRef || null,
        });
      } catch (err) {
        return jsonResponse(502, { error: "mail_backend_error", message: err.message || "Mail backend release failed" }, requestId);
      }

      await store.recordUsage({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v2/mailboxes/leases/{lease_id}/release",
        quantity: 1,
        requestId,
      });

      return jsonResponse(202, { lease_id: leaseId, mailbox_id: lease.mailboxId, lease_status: "released" }, requestId);
    }

    if (method === "POST" && path.startsWith("/v2/mailboxes/accounts/") && path.endsWith("/credentials/reset")) {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const accountId = path.slice("/v2/mailboxes/accounts/".length, -"/credentials/reset".length);
      const mailbox = await store.getTenantMailbox(auth.payload.tenant_id, accountId);
      if (!mailbox) {
        return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
      }

      const credentials = await mailBackend.issueMailboxCredentials({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        mailboxId: accountId,
        address: mailbox.address,
        providerRef: mailbox.providerRef || null,
      });

      await store.recordUsage({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v2/mailboxes/accounts/{account_id}/credentials/reset",
        quantity: 1,
        requestId,
      });

      return jsonResponse(
        200,
        {
          account_id: mailbox.id,
          mailbox_id: mailbox.id,
          address: mailbox.address,
          webmail_login: credentials?.login || mailbox.address,
          webmail_password: credentials?.password || null,
          webmail_url: credentials?.webmailUrl || null,
        },
        requestId,
      );
    }

    return null;
  };
}
