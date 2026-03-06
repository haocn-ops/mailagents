import { randomBytes, randomUUID } from "node:crypto";
import { hashSecret, normalizeAddress } from "../utils.js";

export class MemoryStore {
  constructor({ chainId, challengeTtlMs, mailboxDomain = "pool.mailcloud.local" }) {
    this.chainId = chainId;
    this.challengeTtlMs = challengeTtlMs;
    this.mailboxDomain = mailboxDomain;
    this.state = {
      challenges: new Map(),
      tenantsByWallet: new Map(),
      tenants: new Map(),
      agents: new Map(),
      mailboxes: new Map(),
      leases: new Map(),
      messages: new Map(),
      messageEvents: new Map(),
      webhooks: new Map(),
      usageRecords: [],
      invoices: new Map(),
      riskEvents: new Map(),
      riskPolicies: new Map(),
      auditLogs: [],
    };
  }

  _paginate(items, page, pageSize) {
    const offset = (page - 1) * pageSize;
    return {
      items: items.slice(offset, offset + pageSize),
      page,
      page_size: pageSize,
      total: items.length,
    };
  }

  _getPrimaryDid(tenantId) {
    const tenant = this.state.tenants.get(tenantId);
    return tenant?.did || null;
  }

  _getTenantQuota(tenantId) {
    const tenant = this.state.tenants.get(tenantId);
    return tenant?.quotas || { qps: 120, mailbox_limit: 100 };
  }

  _recordAudit({ tenantId = null, agentId = null, actorDid = null, action, resourceType, resourceId, requestId = null, result = "success", metadata = {} }) {
    this.state.auditLogs.unshift({
      id: randomUUID(),
      tenantId,
      agentId,
      actorDid,
      action,
      resourceType,
      resourceId,
      requestId,
      metadata,
      result,
      createdAt: new Date().toISOString(),
    });
  }

  _recordRisk({ tenantId, severity, type, detail }) {
    const event = {
      id: randomUUID(),
      tenantId,
      severity,
      type,
      detail,
      occurredAt: new Date().toISOString(),
    };
    this.state.riskEvents.set(event.id, event);
    return event;
  }

  _currentLeaseByMailbox(mailboxId) {
    return [...this.state.leases.values()].find((lease) => lease.mailboxId === mailboxId && lease.status === "active") || null;
  }

  _tenantMonthlyUsage(tenantId) {
    return this.state.usageRecords
      .filter((record) => record.tenantId === tenantId)
      .reduce((sum, record) => sum + Number(record.quantity || 0), 0);
  }

  _buildMailboxAddress(prefix, index) {
    return `${prefix}-${index}@${this.mailboxDomain}`;
  }

  _newTenantForWallet(walletAddress) {
    const address = normalizeAddress(walletAddress);
    const tenantId = randomUUID();
    const agentId = randomUUID();
    const did = `did:pkh:eip155:${this.chainId}:${address}`;

    const tenant = {
      id: tenantId,
      name: `tenant-${address.slice(2, 8) || "anon"}`,
      walletAddress: address,
      did,
      status: "active",
      quotas: {
        qps: 120,
        mailbox_limit: 100,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const agent = {
      id: agentId,
      tenantId,
      name: "default-agent",
      status: "active",
      createdAt: new Date().toISOString(),
    };

    this.state.tenants.set(tenantId, tenant);
    this.state.agents.set(agentId, agent);
    this.state.tenantsByWallet.set(address, { tenantId, agentId, did });

    for (let i = 0; i < 5; i += 1) {
      const mailboxId = randomUUID();
      const addressName = this._buildMailboxAddress(address.slice(2, 8) || "agent", i + 1);
      this.state.mailboxes.set(mailboxId, {
        id: mailboxId,
        tenantId,
        address: addressName,
        providerRef: null,
        status: "available",
        createdAt: new Date().toISOString(),
      });
    }

    const invoiceId = randomUUID();
    const monthStart = new Date();
    const start = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1));
    const end = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
    this.state.invoices.set(invoiceId, {
      id: invoiceId,
      tenantId,
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
      amountUsdc: 0,
      status: "draft",
      statementHash: null,
      settlementTxHash: null,
    });

    this._recordAudit({
      tenantId,
      agentId,
      actorDid: did,
      action: "tenant.create",
      resourceType: "tenant",
      resourceId: tenantId,
      metadata: { wallet_address: address },
    });

    return { tenantId, agentId, did };
  }

  async saveChallenge(walletAddress, nonce, message) {
    this.state.challenges.set(normalizeAddress(walletAddress), {
      nonce,
      message,
      createdAt: Date.now(),
    });
  }

  async getChallenge(walletAddress) {
    const challenge = this.state.challenges.get(normalizeAddress(walletAddress));
    if (!challenge) return null;
    if (Date.now() - challenge.createdAt > this.challengeTtlMs) {
      this.state.challenges.delete(normalizeAddress(walletAddress));
      return null;
    }
    return challenge;
  }

  async consumeChallenge(walletAddress) {
    this.state.challenges.delete(normalizeAddress(walletAddress));
  }

  async getOrCreateIdentity(walletAddress) {
    const key = normalizeAddress(walletAddress);
    return this.state.tenantsByWallet.get(key) || this._newTenantForWallet(key);
  }

  async findTenantContext(tenantId, agentId) {
    const tenant = this.state.tenants.get(tenantId);
    const agent = this.state.agents.get(agentId);
    if (!tenant || !agent || agent.tenantId !== tenant.id) {
      return null;
    }
    return { tenant, agent };
  }

  async allocateMailbox({ tenantId, agentId, purpose, ttlHours }) {
    const mailbox = [...this.state.mailboxes.values()].find(
      (box) => box.tenantId === tenantId && box.status === "available",
    );
    if (!mailbox) return null;

    const now = new Date();
    const leaseId = randomUUID();
    const expiresAt = new Date(now.getTime() + ttlHours * 3600 * 1000);
    mailbox.status = "leased";

    const lease = {
      id: leaseId,
      mailboxId: mailbox.id,
      tenantId,
      agentId,
      purpose,
      startedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      releasedAt: null,
      status: "active",
    };

    this.state.leases.set(leaseId, lease);
    mailbox.updatedAt = now.toISOString();

    const msgId = randomUUID();
    const msgReceived = new Date(now.getTime() + 5000).toISOString();
    this.state.messages.set(msgId, {
      id: msgId,
      mailboxId: mailbox.id,
      sender: "noreply@example.com",
      senderDomain: "example.com",
      subject: "Your verification code",
      receivedAt: msgReceived,
    });
    this.state.messageEvents.set(msgId, {
      messageId: msgId,
      eventType: "otp.extracted",
      otpCode: "123456",
      verificationLink: "https://example.com/verify?token=test-token",
      payload: {},
      createdAt: msgReceived,
    });

    this._recordAudit({
      tenantId,
      agentId,
      actorDid: this._getPrimaryDid(tenantId),
      action: "mailbox.allocate",
      resourceType: "mailbox",
      resourceId: mailbox.id,
      metadata: { purpose, expires_at: lease.expiresAt },
    });

    return { mailbox, lease };
  }

  async releaseMailbox({ tenantId, mailboxId }) {
    const mailbox = this.state.mailboxes.get(mailboxId);
    if (!mailbox || mailbox.tenantId !== tenantId) return null;

    const activeLease = [...this.state.leases.values()].find(
      (lease) => lease.mailboxId === mailboxId && lease.tenantId === tenantId && lease.status === "active",
    );

    if (!activeLease) {
      return { mailbox, lease: null };
    }

    activeLease.status = "released";
    activeLease.releasedAt = new Date().toISOString();
    mailbox.status = "available";
    mailbox.updatedAt = activeLease.releasedAt;

    this._recordAudit({
      tenantId,
      agentId: activeLease.agentId,
      actorDid: this._getPrimaryDid(tenantId),
      action: "mailbox.release",
      resourceType: "mailbox",
      resourceId: mailbox.id,
      metadata: { lease_id: activeLease.id },
    });

    return { mailbox, lease: activeLease };
  }

  async saveMailboxProviderRef(mailboxId, providerRef) {
    const mailbox = this.state.mailboxes.get(mailboxId);
    if (!mailbox) return null;
    mailbox.providerRef = providerRef;
    mailbox.updatedAt = new Date().toISOString();
    return mailbox;
  }

  async getLatestMessages({ tenantId, mailboxId, since, limit }) {
    const mailbox = this.state.mailboxes.get(mailboxId);
    if (!mailbox || mailbox.tenantId !== tenantId) return null;

    let rows = [...this.state.messages.values()].filter((m) => m.mailboxId === mailboxId);
    if (since) {
      const sinceDate = new Date(since);
      rows = rows.filter((m) => new Date(m.receivedAt) >= sinceDate);
    }

    rows.sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
    const selected = rows.slice(0, limit);

    return selected.map((m) => {
      const event = this.state.messageEvents.get(m.id) || {};
      return {
        message_id: m.id,
        sender: m.sender,
        sender_domain: m.senderDomain,
        subject: m.subject,
        received_at: m.receivedAt,
        otp_code: event.otpCode ?? null,
        verification_link: event.verificationLink ?? null,
      };
    });
  }

  async createWebhook({ tenantId, eventTypes, targetUrl, secret }) {
    const webhookId = randomUUID();
    const webhook = {
      id: webhookId,
      tenantId,
      targetUrl,
      secretHash: hashSecret(secret),
      eventTypes,
      status: "active",
      createdAt: new Date().toISOString(),
      lastDeliveryAt: null,
      lastStatusCode: null,
    };
    this.state.webhooks.set(webhookId, webhook);
    this._recordAudit({
      tenantId,
      actorDid: this._getPrimaryDid(tenantId),
      action: "webhook.create",
      resourceType: "webhook",
      resourceId: webhookId,
      metadata: { target_url: targetUrl, event_types: eventTypes },
    });
    return webhook;
  }

  async getInvoice(invoiceId, tenantId) {
    const invoice = this.state.invoices.get(invoiceId);
    if (!invoice || invoice.tenantId !== tenantId) return null;
    return invoice;
  }

  async recordUsage({ tenantId, agentId, endpoint, quantity = 1, requestId }) {
    this.state.usageRecords.push({
      id: randomUUID(),
      tenantId,
      agentId,
      endpoint,
      unit: "call",
      quantity,
      occurredAt: new Date().toISOString(),
      requestId,
    });
  }

  async usageSummary(tenantId, start, end) {
    const records = this.state.usageRecords.filter(
      (r) =>
        r.tenantId === tenantId &&
        new Date(r.occurredAt) >= start &&
        new Date(r.occurredAt) < end,
    );

    const apiCalls = records.reduce((acc, curr) => acc + Number(curr.quantity), 0);

    const activeMailboxIds = new Set(
      [...this.state.leases.values()]
        .filter(
          (lease) =>
            lease.tenantId === tenantId &&
            lease.status === "active" &&
            new Date(lease.expiresAt) > new Date(),
        )
        .map((lease) => lease.mailboxId),
    );

    const messageParses = records
      .filter((r) => r.endpoint === "GET /v1/messages/latest")
      .reduce((acc, curr) => acc + Number(curr.quantity), 0);

    return {
      api_calls: apiCalls,
      active_mailboxes: activeMailboxIds.size,
      message_parses: messageParses,
      billable_units: apiCalls,
    };
  }

  async adminOverviewMetrics() {
    const since = Date.now() - 24 * 3600 * 1000;
    const activeTenants = new Set(
      this.state.usageRecords
        .filter((record) => new Date(record.occurredAt).getTime() >= since)
        .map((record) => record.tenantId),
    );
    const activeMailboxLeases = [...this.state.leases.values()].filter((lease) => lease.status === "active").length;
    const inboundMessages = [...this.state.messages.values()].filter((message) => new Date(message.receivedAt).getTime() >= since).length;
    const parsedMessages = [...this.state.messages.values()].filter((message) => this.state.messageEvents.has(message.id)).length;
    const totalMessages = this.state.messages.size || 1;
    const webhookDeliveries = [...this.state.webhooks.values()].filter((webhook) => webhook.lastStatusCode !== null);
    const webhookSuccesses = webhookDeliveries.filter((webhook) => Number(webhook.lastStatusCode) < 400).length;
    const paidCalls = this.state.usageRecords.filter((record) => record.endpoint !== "GET /v1/usage/summary").length;
    const allocateCalls = this.state.usageRecords.filter((record) => record.endpoint === "POST /v1/mailboxes/allocate").length || 1;

    return {
      active_tenants_24h: activeTenants.size,
      active_mailbox_leases: activeMailboxLeases,
      inbound_messages_24h: inboundMessages,
      otp_extract_success_rate: Number(((parsedMessages / totalMessages) * 100).toFixed(1)),
      webhook_success_rate: Number((((webhookDeliveries.length ? webhookSuccesses / webhookDeliveries.length : 1)) * 100).toFixed(1)),
      payment_conversion_rate: Number((((paidCalls / allocateCalls) || 1) * 100).toFixed(1)),
    };
  }

  async adminOverviewTimeseries({ from, to, bucket }) {
    const start = from ? new Date(from) : new Date(Date.now() - 12 * 3600 * 1000);
    const end = to ? new Date(to) : new Date();
    const stepMs = bucket === "day" ? 24 * 3600 * 1000 : bucket === "minute" ? 60 * 1000 : 3600 * 1000;
    const points = [];

    for (let ts = start.getTime(); ts <= end.getTime(); ts += stepMs) {
      const bucketEnd = ts + stepMs;
      const value = [...this.state.messages.values()].filter((message) => {
        const receivedAt = new Date(message.receivedAt).getTime();
        return receivedAt >= ts && receivedAt < bucketEnd;
      }).length;
      points.push({ ts: new Date(ts).toISOString(), value });
    }

    return { points };
  }

  async adminListTenants({ page, pageSize, status }) {
    let items = [...this.state.tenants.values()].map((tenant) => {
      const activeAgents = [...this.state.agents.values()].filter((agent) => agent.tenantId === tenant.id && agent.status === "active").length;
      const activeMailboxes = [...this.state.mailboxes.values()].filter((mailbox) => mailbox.tenantId === tenant.id && mailbox.status === "leased").length;
      return {
        tenant_id: tenant.id,
        name: tenant.name,
        status: tenant.status,
        primary_did: tenant.did,
        active_agents: activeAgents,
        active_mailboxes: activeMailboxes,
        monthly_usage: Number(this._tenantMonthlyUsage(tenant.id).toFixed(2)),
        updated_at: tenant.updatedAt || tenant.createdAt,
      };
    });
    if (status) items = items.filter((tenant) => tenant.status === status);
    items.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    return this._paginate(items, page, pageSize);
  }

  async adminGetTenant(tenantId) {
    const tenant = this.state.tenants.get(tenantId);
    if (!tenant) return null;
    const summary = await this.adminListTenants({ page: 1, pageSize: Number.MAX_SAFE_INTEGER, status: null });
    const base = summary.items.find((item) => item.tenant_id === tenantId);
    return {
      ...base,
      quotas: this._getTenantQuota(tenantId),
    };
  }

  async adminPatchTenant(tenantId, patch, context = {}) {
    const tenant = this.state.tenants.get(tenantId);
    if (!tenant) return null;
    if (patch.status) tenant.status = patch.status;
    if (patch.quotas) {
      tenant.quotas = {
        ...this._getTenantQuota(tenantId),
        ...patch.quotas,
      };
    }
    tenant.updatedAt = new Date().toISOString();
    this._recordAudit({
      tenantId,
      actorDid: context.actorDid,
      action: "tenant.update",
      resourceType: "tenant",
      resourceId: tenantId,
      requestId: context.requestId,
      metadata: patch,
    });
    return this.adminGetTenant(tenantId);
  }

  async adminListMailboxes({ page, pageSize, status, tenantId }) {
    let items = [...this.state.mailboxes.values()].map((mailbox) => {
      const lease = this._currentLeaseByMailbox(mailbox.id);
      return {
        mailbox_id: mailbox.id,
        address: mailbox.address,
        type: mailbox.type || "alias",
        status: mailbox.status,
        tenant_id: mailbox.tenantId,
        agent_id: lease?.agentId || null,
        lease_expires_at: lease?.expiresAt || null,
      };
    });
    if (status) items = items.filter((mailbox) => mailbox.status === status);
    if (tenantId) items = items.filter((mailbox) => mailbox.tenant_id === tenantId);
    items.sort((a, b) => String(a.address).localeCompare(String(b.address)));
    return this._paginate(items, page, pageSize);
  }

  async adminFreezeMailbox(mailboxId, { reason, actorDid, requestId }) {
    const mailbox = this.state.mailboxes.get(mailboxId);
    if (!mailbox) return null;
    mailbox.status = "frozen";
    mailbox.updatedAt = new Date().toISOString();
    const activeLease = this._currentLeaseByMailbox(mailboxId);
    if (activeLease) {
      activeLease.status = "released";
      activeLease.releasedAt = mailbox.updatedAt;
    }
    this._recordRisk({
      tenantId: mailbox.tenantId,
      severity: "high",
      type: "mailbox.frozen",
      detail: reason,
    });
    this._recordAudit({
      tenantId: mailbox.tenantId,
      actorDid,
      action: "mailbox.freeze",
      resourceType: "mailbox",
      resourceId: mailboxId,
      requestId,
      metadata: { reason },
    });
    return { status: "frozen" };
  }

  async adminReleaseMailbox(mailboxId, { actorDid, requestId }) {
    const mailbox = this.state.mailboxes.get(mailboxId);
    if (!mailbox) return null;
    const activeLease = this._currentLeaseByMailbox(mailboxId);
    if (activeLease) {
      activeLease.status = "released";
      activeLease.releasedAt = new Date().toISOString();
    }
    mailbox.status = "available";
    mailbox.updatedAt = new Date().toISOString();
    this._recordAudit({
      tenantId: mailbox.tenantId,
      actorDid,
      action: "mailbox.admin_release",
      resourceType: "mailbox",
      resourceId: mailboxId,
      requestId,
    });
    return { status: "released" };
  }

  async adminListMessages({ page, pageSize, mailboxId, parsedStatus }) {
    let items = [...this.state.messages.values()].map((message) => {
      const event = this.state.messageEvents.get(message.id);
      const status = event ? "parsed" : "pending";
      return {
        message_id: message.id,
        mailbox_id: message.mailboxId,
        sender_domain: message.senderDomain,
        subject: message.subject,
        received_at: message.receivedAt,
        parsed_status: status,
        otp_extracted: Boolean(event?.otpCode),
      };
    });
    if (mailboxId) items = items.filter((message) => message.mailbox_id === mailboxId);
    if (parsedStatus) items = items.filter((message) => message.parsed_status === parsedStatus);
    items.sort((a, b) => new Date(b.received_at) - new Date(a.received_at));
    return this._paginate(items, page, pageSize);
  }

  async adminReparseMessage(messageId, { actorDid, requestId }) {
    const message = this.state.messages.get(messageId);
    if (!message) return null;
    this.state.messageEvents.set(messageId, {
      messageId,
      eventType: "otp.extracted",
      otpCode: "654321",
      verificationLink: "https://example.com/verify?token=reparsed",
      payload: { source: "admin-reparse" },
      createdAt: new Date().toISOString(),
    });
    this._recordAudit({
      tenantId: this.state.mailboxes.get(message.mailboxId)?.tenantId || null,
      actorDid,
      action: "message.reparse",
      resourceType: "message",
      resourceId: messageId,
      requestId,
    });
    return { status: "accepted" };
  }

  async adminReplayMessageWebhook(messageId, { actorDid, requestId }) {
    const message = this.state.messages.get(messageId);
    if (!message) return null;
    const mailbox = this.state.mailboxes.get(message.mailboxId);
    const webhook = [...this.state.webhooks.values()].find((item) => item.tenantId === mailbox?.tenantId);
    if (webhook) {
      webhook.lastDeliveryAt = new Date().toISOString();
      webhook.lastStatusCode = 200;
    }
    this._recordAudit({
      tenantId: mailbox?.tenantId || null,
      actorDid,
      action: "message.replay_webhook",
      resourceType: "message",
      resourceId: messageId,
      requestId,
    });
    return { status: "accepted" };
  }

  async adminListWebhooks({ page, pageSize }) {
    const items = [...this.state.webhooks.values()]
      .map((webhook) => ({
        webhook_id: webhook.id,
        tenant_id: webhook.tenantId,
        target_url: webhook.targetUrl,
        event_types: webhook.eventTypes,
        status: webhook.status,
        last_delivery_at: webhook.lastDeliveryAt,
        last_status_code: webhook.lastStatusCode,
      }))
      .sort((a, b) => String(a.target_url).localeCompare(String(b.target_url)));
    return this._paginate(items, page, pageSize);
  }

  async adminReplayWebhook(webhookId, { from, to, actorDid, requestId }) {
    const webhook = this.state.webhooks.get(webhookId);
    if (!webhook) return null;
    webhook.lastDeliveryAt = new Date().toISOString();
    webhook.lastStatusCode = 200;
    this._recordAudit({
      tenantId: webhook.tenantId,
      actorDid,
      action: "webhook.replay",
      resourceType: "webhook",
      resourceId: webhookId,
      requestId,
      metadata: { from, to },
    });
    return { status: "accepted" };
  }

  async adminRotateWebhookSecret(webhookId, { actorDid, requestId }) {
    const webhook = this.state.webhooks.get(webhookId);
    if (!webhook) return null;
    const nextSecret = randomBytes(18).toString("hex");
    webhook.secretHash = hashSecret(nextSecret);
    this._recordAudit({
      tenantId: webhook.tenantId,
      actorDid,
      action: "webhook.rotate_secret",
      resourceType: "webhook",
      resourceId: webhookId,
      requestId,
    });
    return { webhook_id: webhookId, secret: nextSecret };
  }

  async adminListInvoices({ page, pageSize, period }) {
    let items = [...this.state.invoices.values()].map((invoice) => ({
      invoice_id: invoice.id,
      tenant_id: invoice.tenantId,
      period: invoice.periodStart.slice(0, 7),
      amount_usdc: Number(invoice.amountUsdc),
      status: invoice.status,
      settlement_tx_hash: invoice.settlementTxHash,
    }));
    if (period) items = items.filter((invoice) => invoice.period === period);
    items.sort((a, b) => String(b.period).localeCompare(String(a.period)));
    return this._paginate(items, page, pageSize);
  }

  async adminIssueInvoice(invoiceId, { actorDid, requestId }) {
    const invoice = this.state.invoices.get(invoiceId);
    if (!invoice) return null;
    invoice.status = "issued";
    invoice.statementHash = `stmt_${randomUUID().replace(/-/g, "")}`;
    this._recordAudit({
      tenantId: invoice.tenantId,
      actorDid,
      action: "invoice.issue",
      resourceType: "invoice",
      resourceId: invoiceId,
      requestId,
    });
    return { status: "issued" };
  }

  async adminListRiskEvents({ page, pageSize }) {
    const items = [...this.state.riskEvents.values()]
      .map((event) => ({
        event_id: event.id,
        tenant_id: event.tenantId,
        severity: event.severity,
        type: event.type,
        detail: event.detail,
        occurred_at: event.occurredAt,
      }))
      .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
    return this._paginate(items, page, pageSize);
  }

  async adminUpsertRiskPolicy({ policyType, value, action, actorDid, requestId }) {
    const key = `${policyType}:${value}`;
    if (action === "remove") {
      this.state.riskPolicies.delete(key);
    } else {
      this.state.riskPolicies.set(key, {
        id: key,
        policyType,
        value,
        action,
        updatedAt: new Date().toISOString(),
      });
    }
    this._recordAudit({
      actorDid,
      action: "risk.policy_update",
      resourceType: "risk_policy",
      resourceId: key,
      requestId,
      metadata: { policy_type: policyType, value, action },
    });
    return { status: "updated" };
  }

  async adminListAuditLogs({ page, pageSize, requestId, tenantId, actorDid }) {
    let items = this.state.auditLogs.map((entry) => ({
      log_id: entry.id,
      timestamp: entry.createdAt,
      tenant_id: entry.tenantId,
      actor_did: entry.actorDid,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId,
      request_id: entry.requestId,
      result: entry.result,
    }));
    if (requestId) items = items.filter((entry) => entry.request_id === requestId);
    if (tenantId) items = items.filter((entry) => entry.tenant_id === tenantId);
    if (actorDid) items = items.filter((entry) => entry.actor_did === actorDid);
    return this._paginate(items, page, pageSize);
  }

  getStateForTests() {
    return this.state;
  }
}
