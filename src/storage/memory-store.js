import { randomBytes, randomUUID } from "node:crypto";
import { encryptSecret, hashSecret, normalizeAddress } from "../utils.js";

export class MemoryStore {
  constructor({ chainId, challengeTtlMs, mailboxDomain = "pool.mailcloud.local", webhookSecretEncryptionKey }) {
    this.chainId = chainId;
    this.challengeTtlMs = challengeTtlMs;
    this.mailboxDomain = mailboxDomain;
    this.webhookSecretEncryptionKey = webhookSecretEncryptionKey;
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
      runtimeSettings: {
        overage_charge_usdc: null,
        agent_allocate_hourly_limit: null,
      },
      mailboxAccountsV2: new Map(),
      mailboxLeasesV2: new Map(),
      rawMessagesV2: new Map(),
      messagesV2: new Map(),
      messageParseResultsV2: new Map(),
      sendAttempts: new Map(),
      sendAttemptEvents: new Map(),
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

  _mailboxPrefixForAddress(walletAddress) {
    const compact = normalizeAddress(walletAddress).replace(/^0x/, "");
    return `${compact.slice(0, 6) || "agent"}${compact.slice(-4) || "0000"}`;
  }

  _newTenantForWallet(walletAddress) {
    const address = normalizeAddress(walletAddress);
    const tenantId = randomUUID();
    const agentId = randomUUID();
    const did = `did:pkh:eip155:${this.chainId}:${address}`;

    const tenant = {
      id: tenantId,
      name: `tenant-${this._mailboxPrefixForAddress(address)}`,
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
      const addressName = this._buildMailboxAddress(this._mailboxPrefixForAddress(address), i + 1);
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

  async getTenantPolicy(tenantId) {
    const tenant = this.state.tenants.get(tenantId);
    if (!tenant) return null;
    return {
      tenantId: tenant.id,
      status: tenant.status,
      quotas: this._getTenantQuota(tenantId),
    };
  }

  async getRuntimeSettings() {
    return { ...this.state.runtimeSettings };
  }

  async updateRuntimeSettings(patch = {}) {
    if (patch.overage_charge_usdc !== undefined) {
      this.state.runtimeSettings.overage_charge_usdc = Number(patch.overage_charge_usdc);
    }
    if (patch.agent_allocate_hourly_limit !== undefined) {
      this.state.runtimeSettings.agent_allocate_hourly_limit = Number(patch.agent_allocate_hourly_limit);
    }
    return this.getRuntimeSettings();
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
    // Keep the seeded sample behind real inbound mail in "latest" queries.
    const msgReceived = new Date(now.getTime() - 5000).toISOString();
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

  async listTenantMailboxes(tenantId) {
    return [...this.state.mailboxes.values()]
      .filter((mailbox) => mailbox.tenantId === tenantId)
      .map((mailbox) => {
        const lease = this._currentLeaseByMailbox(mailbox.id);
        return {
          mailbox_id: mailbox.id,
          address: mailbox.address,
          status: mailbox.status,
          lease_expires_at: lease?.expiresAt || null,
          provider_ref: mailbox.providerRef || null,
          updated_at: mailbox.updatedAt || mailbox.createdAt || null,
        };
      })
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  }

  async saveMailboxProviderRef(mailboxId, providerRef) {
    const mailbox = this.state.mailboxes.get(mailboxId);
    if (!mailbox) return null;
    mailbox.providerRef = providerRef;
    mailbox.updatedAt = new Date().toISOString();
    return mailbox;
  }

  async findMailboxByAddress(address) {
    const normalized = String(address || "").trim().toLowerCase();
    return [...this.state.mailboxes.values()].find((mailbox) => mailbox.address.toLowerCase() === normalized) || null;
  }

  async getTenantMailbox(tenantId, mailboxId) {
    const mailbox = this.state.mailboxes.get(mailboxId);
    if (!mailbox || mailbox.tenantId !== tenantId) return null;
    return {
      id: mailbox.id,
      tenantId: mailbox.tenantId,
      address: mailbox.address,
      status: mailbox.status,
      providerRef: mailbox.providerRef || null,
    };
  }

  async listTenantMailboxAccountsV2({ tenantId, page, pageSize }) {
    const items = [...this.state.mailboxes.values()]
      .filter((mailbox) => mailbox.tenantId === tenantId)
      .map((mailbox) => {
        const account = [...this.state.mailboxAccountsV2.values()].find((item) => item.legacyMailboxId === mailbox.id) || null;
        return {
          mailbox_id: mailbox.id,
          mailbox_account_id: account?.id || null,
          address: mailbox.address,
          domain: account?.domain || String(mailbox.address).split("@")[1] || this.mailboxDomain,
          mailbox_type: account?.mailboxType || "pooled",
          backend_ref: account?.backendRef || mailbox.providerRef || null,
          backend_status: account?.backendStatus || (mailbox.status === "leased" ? "active" : "disabled"),
          last_password_reset_at: account?.lastPasswordResetAt || null,
          updated_at: account?.updatedAt || mailbox.updatedAt || mailbox.createdAt || null,
        };
      })
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
    return this._paginate(items, page, pageSize);
  }

  async listTenantMailboxLeasesV2({ tenantId, page, pageSize, leaseStatus = null }) {
    let items = [...this.state.mailboxLeasesV2.values()]
      .filter((lease) => lease.tenantId === tenantId)
      .map((lease) => {
        const account = this.state.mailboxAccountsV2.get(lease.mailboxAccountId) || null;
        return {
          lease_id: lease.id,
          mailbox_id: account?.legacyMailboxId || null,
          mailbox_account_id: lease.mailboxAccountId,
          agent_id: lease.agentId,
          purpose: lease.purpose,
          lease_status: lease.status,
          started_at: lease.startedAt,
          ends_at: lease.endsAt,
          released_at: lease.releasedAt,
          address: account?.address || null,
          created_at: lease.createdAt,
          updated_at: lease.updatedAt,
        };
      });
    if (leaseStatus) {
      items = items.filter((lease) => lease.lease_status === leaseStatus);
    }
    items.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    return this._paginate(items, page, pageSize);
  }

  async getTenantMailboxLeaseV2(tenantId, leaseId) {
    const lease = this.state.mailboxLeasesV2.get(leaseId);
    if (!lease || lease.tenantId !== tenantId) return null;
    const account = this.state.mailboxAccountsV2.get(lease.mailboxAccountId) || null;
    return {
      lease_id: lease.id,
      mailbox_id: account?.legacyMailboxId || null,
      mailbox_account_id: lease.mailboxAccountId,
      agent_id: lease.agentId,
      purpose: lease.purpose,
      lease_status: lease.status,
      started_at: lease.startedAt,
      ends_at: lease.endsAt,
      released_at: lease.releasedAt,
      address: account?.address || null,
      created_at: lease.createdAt,
      updated_at: lease.updatedAt,
    };
  }

  async upsertMailboxAccountFromLegacyMailbox(mailbox) {
    const existing = [...this.state.mailboxAccountsV2.values()].find((item) => item.address === mailbox.address);
    if (existing) {
      existing.backendStatus = mailbox.status === "leased" ? "active" : "disabled";
      existing.backendRef = mailbox.providerRef || existing.backendRef || null;
      existing.updatedAt = new Date().toISOString();
      return existing;
    }

    const account = {
      id: randomUUID(),
      legacyMailboxId: mailbox.id,
      address: mailbox.address,
      domain: String(mailbox.address).split("@")[1] || this.mailboxDomain,
      backendRef: mailbox.providerRef || null,
      backendStatus: mailbox.status === "leased" ? "active" : "disabled",
      mailboxType: "pooled",
      lastPasswordResetAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.state.mailboxAccountsV2.set(account.id, account);
    return account;
  }

  async createMailboxLeaseV2({ mailboxAccountId, tenantId, agentId, purpose, endsAt }) {
    const lease = {
      id: randomUUID(),
      mailboxAccountId,
      tenantId,
      agentId,
      purpose,
      status: "pending",
      startedAt: null,
      endsAt,
      releasedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.state.mailboxLeasesV2.set(lease.id, lease);
    return lease;
  }

  async markMailboxAccountProvisioned({ mailboxAccountId, providerRef = null }) {
    const account = this.state.mailboxAccountsV2.get(mailboxAccountId);
    if (!account) return null;
    account.backendStatus = "active";
    if (providerRef) account.backendRef = providerRef;
    account.updatedAt = new Date().toISOString();
    return account;
  }

  async markMailboxLeaseV2Active(leaseId) {
    const lease = this.state.mailboxLeasesV2.get(leaseId);
    if (!lease) return null;
    lease.status = "active";
    lease.startedAt = lease.startedAt || new Date().toISOString();
    lease.updatedAt = new Date().toISOString();
    return lease;
  }

  async getActiveMailboxLeaseV2ByLegacyMailboxId(legacyMailboxId) {
    const account = [...this.state.mailboxAccountsV2.values()].find((item) => item.legacyMailboxId === legacyMailboxId);
    if (!account) return null;
    return (
      [...this.state.mailboxLeasesV2.values()].find(
        (lease) => lease.mailboxAccountId === account.id && lease.status === "active",
      ) || null
    );
  }

  async markMailboxAccountReleased(mailboxAccountId) {
    const account = this.state.mailboxAccountsV2.get(mailboxAccountId);
    if (!account) return null;
    account.backendStatus = "disabled";
    account.updatedAt = new Date().toISOString();
    return account;
  }

  async markMailboxLeaseV2Released(leaseId) {
    const lease = this.state.mailboxLeasesV2.get(leaseId);
    if (!lease) return null;
    lease.status = "released";
    lease.releasedAt = new Date().toISOString();
    lease.updatedAt = lease.releasedAt;
    return lease;
  }

  async markMailboxAccountCredentialsReset(mailboxAccountId) {
    const account = this.state.mailboxAccountsV2.get(mailboxAccountId);
    if (!account) return null;
    account.lastPasswordResetAt = new Date().toISOString();
    account.updatedAt = account.lastPasswordResetAt;
    return account;
  }

  async createSendAttempt({ tenantId, agentId, mailboxAccountId, legacyMailboxId, fromAddress, to, subject }) {
    const attempt = {
      id: randomUUID(),
      tenantId,
      agentId,
      mailboxAccountId,
      legacyMailboxId,
      fromAddress,
      to,
      subject,
      status: "queued",
      backendQueueId: null,
      smtpResponse: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      submittedAt: null,
    };
    this.state.sendAttempts.set(attempt.id, attempt);
    this.state.sendAttemptEvents.set(attempt.id, [
      {
        eventType: "queued",
        payload: {},
        createdAt: attempt.createdAt,
      },
    ]);
    return attempt;
  }

  async completeSendAttempt({ sendAttemptId, backendQueueId = null, smtpResponse = null }) {
    const attempt = this.state.sendAttempts.get(sendAttemptId);
    if (!attempt) return null;
    attempt.status = "accepted";
    attempt.backendQueueId = backendQueueId;
    attempt.smtpResponse = smtpResponse;
    attempt.submittedAt = new Date().toISOString();
    attempt.updatedAt = attempt.submittedAt;
    const events = this.state.sendAttemptEvents.get(sendAttemptId) || [];
    events.push({
      eventType: "accepted",
      payload: { backend_queue_id: backendQueueId, smtp_response: smtpResponse },
      createdAt: attempt.submittedAt,
    });
    this.state.sendAttemptEvents.set(sendAttemptId, events);
    return attempt;
  }

  async failSendAttempt({ sendAttemptId, errorMessage }) {
    const attempt = this.state.sendAttempts.get(sendAttemptId);
    if (!attempt) return null;
    attempt.status = "failed";
    attempt.smtpResponse = errorMessage;
    attempt.updatedAt = new Date().toISOString();
    const events = this.state.sendAttemptEvents.get(sendAttemptId) || [];
    events.push({
      eventType: "failed",
      payload: { error: errorMessage },
      createdAt: attempt.updatedAt,
    });
    this.state.sendAttemptEvents.set(sendAttemptId, events);
    return attempt;
  }

  async getActiveLeaseByMailboxId(mailboxId) {
    const lease = this._currentLeaseByMailbox(mailboxId);
    if (!lease) return null;
    return {
      id: lease.id,
      tenantId: lease.tenantId,
      agentId: lease.agentId,
      purpose: lease.purpose,
      status: lease.status,
      startedAt: lease.startedAt,
      expiresAt: lease.expiresAt,
      releasedAt: lease.releasedAt,
    };
  }

  async ingestInboundMessage({
    tenantId,
    mailboxId,
    providerMessageId,
    sender,
    senderDomain,
    subject,
    rawRef,
    receivedAt,
    payload = {},
    requestId = null,
  }) {
    const mailbox = this.state.mailboxes.get(mailboxId);
    if (!mailbox || mailbox.tenantId !== tenantId) return null;

    if (providerMessageId) {
      const existing = [...this.state.messages.values()].find(
        (message) => message.mailboxId === mailboxId && message.providerMessageId === providerMessageId,
      );
      if (existing) {
        return { tenantId, mailboxId, messageId: existing.id, deduped: true };
      }
    }

    const messageId = randomUUID();
    this.state.messages.set(messageId, {
      id: messageId,
      mailboxId,
      providerMessageId,
      sender,
      senderDomain,
      subject,
      rawRef,
      receivedAt,
      createdAt: new Date().toISOString(),
    });
    this.state.messageEvents.set(messageId, {
      messageId,
      eventType: "mail.received",
      otpCode: null,
      verificationLink: null,
      payload,
      createdAt: receivedAt,
    });

    this._recordAudit({
      tenantId,
      actorDid: "system:mailu",
      action: "message.ingest",
      resourceType: "message",
      resourceId: messageId,
      requestId,
      metadata: { mailbox_id: mailboxId, sender_domain: senderDomain },
    });

    const mailboxAccount = await this.upsertMailboxAccountFromLegacyMailbox(mailbox);
    const activeLease = await this.getActiveLeaseByMailboxId(mailboxId);
    const rawMessageId = randomUUID();
    this.state.rawMessagesV2.set(rawMessageId, {
      id: rawMessageId,
      mailboxAccountId: mailboxAccount?.id || mailboxId,
      backendMessageId: providerMessageId || null,
      rawRef: rawRef || null,
      headersJson: payload.headers || {},
      sender,
      senderDomain,
      subject,
      receivedAt,
      ingestedAt: new Date().toISOString(),
    });
    this.state.messagesV2.set(messageId, {
      id: messageId,
      rawMessageId,
      tenantId,
      agentId: activeLease?.agentId || null,
      mailboxAccountId: mailboxAccount?.id || mailboxId,
      mailboxLeaseId: activeLease?.id || null,
      fromAddress: sender,
      subject,
      receivedAt,
      messageStatus: "received",
      createdAt: new Date().toISOString(),
    });

    return { tenantId, mailboxId, messageId };
  }

  async recordMailboxBackendEvent({ tenantId, mailboxId, action, requestId = null, metadata = {} }) {
    const mailbox = this.state.mailboxes.get(mailboxId);
    if (!mailbox || mailbox.tenantId !== tenantId) return null;
    this._recordAudit({
      tenantId,
      actorDid: "system:mailu",
      action,
      resourceType: "mailbox",
      resourceId: mailboxId,
      requestId,
      metadata,
    });
    return { tenantId, mailboxId };
  }

  async getMessage(messageId) {
    const message = this.state.messages.get(messageId);
    if (!message) return null;
    const mailbox = this.state.mailboxes.get(message.mailboxId);
    return {
      messageId: message.id,
      tenantId: mailbox?.tenantId || null,
      mailboxId: message.mailboxId,
      providerMessageId: message.providerMessageId || null,
      sender: message.sender,
      senderDomain: message.senderDomain,
      subject: message.subject,
      rawRef: message.rawRef || null,
      receivedAt: message.receivedAt,
    };
  }

  async getTenantMessageDetail(tenantId, messageId) {
    const message = this.state.messages.get(messageId);
    if (!message) return null;
    const mailbox = this.state.mailboxes.get(message.mailboxId);
    if (!mailbox || mailbox.tenantId !== tenantId) return null;
    const event = this.state.messageEvents.get(messageId) || null;
    return {
      message_id: message.id,
      mailbox_id: message.mailboxId,
      sender: message.sender,
      sender_domain: message.senderDomain,
      subject: message.subject,
      raw_ref: message.rawRef || null,
      received_at: message.receivedAt,
      otp_code: event?.otpCode ?? null,
      verification_link: event?.verificationLink ?? null,
      parsed_status: event
        ? event.eventType === "otp.extracted"
          ? "parsed"
          : event.eventType === "mail.parse_failed"
            ? "failed"
            : "pending"
        : "pending",
    };
  }

  async listTenantMessagesV2({ tenantId, mailboxId = null, page, pageSize, messageStatus = null }) {
    const mailboxAccount =
      mailboxId
        ? [...this.state.mailboxAccountsV2.values()].find((item) => item.legacyMailboxId === mailboxId) || null
        : null;

    let items = [...this.state.messagesV2.values()]
      .filter((message) => message.tenantId === tenantId)
      .filter((message) => !mailboxId || message.mailboxAccountId === (mailboxAccount?.id || mailboxId))
      .map((message) => {
        const parseResults = this.state.messageParseResultsV2.get(message.id) || [];
        const latestParse = parseResults.at(-1) || null;
        const account = this.state.mailboxAccountsV2.get(message.mailboxAccountId) || null;
        return {
          message_id: message.id,
          mailbox_id: account?.legacyMailboxId || null,
          mailbox_account_id: message.mailboxAccountId,
          mailbox_lease_id: message.mailboxLeaseId,
          from_address: message.fromAddress,
          subject: message.subject,
          received_at: message.receivedAt,
          message_status: message.messageStatus,
          otp_code: latestParse?.otpCode || null,
          verification_link: latestParse?.verificationLink || null,
          parser_version: latestParse?.parserVersion || null,
        };
      });

    if (messageStatus) {
      items = items.filter((item) => item.message_status === messageStatus);
    }

    items.sort((a, b) => new Date(b.received_at) - new Date(a.received_at));
    return this._paginate(items, page, pageSize);
  }

  async getTenantMessageDetailV2(tenantId, messageId) {
    const message = this.state.messagesV2.get(messageId);
    if (!message || message.tenantId !== tenantId) return null;
    const parseResults = this.state.messageParseResultsV2.get(messageId) || [];
    const latestParse = parseResults.at(-1) || null;
    const account = this.state.mailboxAccountsV2.get(message.mailboxAccountId) || null;
    return {
      message_id: message.id,
      mailbox_id: account?.legacyMailboxId || null,
      mailbox_account_id: message.mailboxAccountId,
      mailbox_lease_id: message.mailboxLeaseId,
      from_address: message.fromAddress,
      subject: message.subject,
      received_at: message.receivedAt,
      message_status: message.messageStatus,
      otp_code: latestParse?.otpCode || null,
      verification_link: latestParse?.verificationLink || null,
      parser_version: latestParse?.parserVersion || null,
      parse_status: latestParse?.parseStatus || null,
      text_excerpt: latestParse?.textExcerpt || null,
      confidence: latestParse?.confidence ?? null,
      error_code: latestParse?.errorCode || null,
    };
  }

  async applyMessageParseResult({ messageId, otpCode, verificationLink, payload = {}, requestId = null }) {
    const message = this.state.messages.get(messageId);
    if (!message) return null;
    const mailbox = this.state.mailboxes.get(message.mailboxId);
    this.state.messageEvents.set(messageId, {
      messageId,
      eventType: otpCode || verificationLink ? "otp.extracted" : "mail.parse_failed",
      otpCode: otpCode || null,
      verificationLink: verificationLink || null,
      payload,
      createdAt: new Date().toISOString(),
    });
    this._recordAudit({
      tenantId: mailbox?.tenantId || null,
      actorDid: "system:parser",
      action: "message.parsed",
      resourceType: "message",
      resourceId: messageId,
      requestId,
      metadata: { otp_extracted: Boolean(otpCode), verification_link: Boolean(verificationLink) },
    });

    const messageV2 = this.state.messagesV2.get(messageId);
    if (messageV2) {
      messageV2.messageStatus = otpCode || verificationLink ? "parsed" : "parse_failed";
      const results = this.state.messageParseResultsV2.get(messageId) || [];
      results.push({
        id: randomUUID(),
        messageId,
        parserVersion: String(payload.parser || "builtin"),
        parseStatus: otpCode || verificationLink ? "parsed" : "failed",
        otpCode: otpCode || null,
        verificationLink: verificationLink || null,
        textExcerpt: payload.text_excerpt || null,
        confidence: otpCode || verificationLink ? 0.9 : 0.0,
        errorCode: otpCode || verificationLink ? null : "NO_MATCH",
        createdAt: new Date().toISOString(),
      });
      this.state.messageParseResultsV2.set(messageId, results);
    }

    return { messageId };
  }

  async listActiveWebhooksByEvent(tenantId, eventType) {
    return [...this.state.webhooks.values()].filter(
      (webhook) =>
        webhook.tenantId === tenantId &&
        webhook.status === "active" &&
        Array.isArray(webhook.eventTypes) &&
        webhook.eventTypes.includes(eventType),
    ).map((webhook) => ({ ...webhook }));
  }

  async recordWebhookDelivery(webhookId, { statusCode, requestId = null, metadata = {} }) {
    const webhook = this.state.webhooks.get(webhookId);
    if (!webhook) return null;
    webhook.lastDeliveryAt = new Date().toISOString();
    webhook.lastStatusCode = statusCode;
    this._recordAudit({
      tenantId: webhook.tenantId,
      actorDid: "system:webhook",
      action: "webhook.deliver",
      resourceType: "webhook",
      resourceId: webhookId,
      requestId,
      metadata: { status_code: statusCode, ...metadata },
    });
    return webhook;
  }

  async getWebhook(webhookId) {
    const webhook = this.state.webhooks.get(webhookId);
    return webhook ? { ...webhook } : null;
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
      secretEnc: encryptSecret(secret, this.webhookSecretEncryptionKey),
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

  async listTenantWebhooks(tenantId) {
    return [...this.state.webhooks.values()]
      .filter((webhook) => webhook.tenantId === tenantId)
      .map((webhook) => ({
        webhook_id: webhook.id,
        event_types: webhook.eventTypes,
        target_url: webhook.targetUrl,
        status: webhook.status,
        last_delivery_at: webhook.lastDeliveryAt,
        last_status_code: webhook.lastStatusCode,
      }))
      .sort((a, b) => String(a.target_url).localeCompare(String(b.target_url)));
  }

  async listTenantWebhookDeliveries({ tenantId, page, pageSize, webhookId = null }) {
    let items = this.state.auditLogs
      .filter((entry) => entry.tenantId === tenantId && entry.action === "webhook.deliver" && entry.resourceType === "webhook")
      .map((entry) => {
        const webhook = this.state.webhooks.get(entry.resourceId);
        return {
          delivery_log_id: entry.id,
          webhook_id: entry.resourceId,
          target_url: webhook?.targetUrl || null,
          event_type: entry.metadata?.event_type || null,
          status_code: entry.metadata?.status_code ?? null,
          attempts: entry.metadata?.attempts ?? null,
          ok: entry.metadata?.ok ?? null,
          delivery_id: entry.metadata?.delivery_id || null,
          error_message: entry.metadata?.error_message || null,
          response_excerpt: entry.metadata?.response_excerpt || null,
          request_id: entry.requestId,
          delivered_at: entry.createdAt,
        };
      });
    if (webhookId) items = items.filter((item) => item.webhook_id === webhookId);
    items.sort((a, b) => String(b.delivered_at).localeCompare(String(a.delivered_at)));
    return this._paginate(items, page, pageSize);
  }

  async getInvoice(invoiceId, tenantId) {
    const invoice = this.state.invoices.get(invoiceId);
    if (!invoice || invoice.tenantId !== tenantId) return null;
    return invoice;
  }

  async listTenantInvoices(tenantId, period = null) {
    let items = [...this.state.invoices.values()]
      .filter((invoice) => invoice.tenantId === tenantId)
      .map((invoice) => ({
        invoice_id: invoice.id,
        period: invoice.periodStart.slice(0, 7),
        amount_usdc: Number(invoice.amountUsdc),
        status: invoice.status,
        period_start: invoice.periodStart,
        period_end: invoice.periodEnd,
        settlement_tx_hash: invoice.settlementTxHash,
      }));
    if (period) items = items.filter((invoice) => invoice.period === period);
    items.sort((a, b) => String(b.period).localeCompare(String(a.period)));
    return items;
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

  async countTenantUsageSince(tenantId, since) {
    return this.state.usageRecords
      .filter((record) => record.tenantId === tenantId && new Date(record.occurredAt) >= since)
      .reduce((sum, record) => sum + Number(record.quantity || 0), 0);
  }

  async countAgentEndpointUsageSince(tenantId, agentId, endpoint, since) {
    return this.state.usageRecords
      .filter(
        (record) =>
          record.tenantId === tenantId &&
          record.agentId === agentId &&
          record.endpoint === endpoint &&
          new Date(record.occurredAt) >= since,
      )
      .reduce((sum, record) => sum + Number(record.quantity || 0), 0);
  }

  _getOrCreateCurrentInvoice(tenantId) {
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    let invoice = [...this.state.invoices.values()].find(
      (item) => item.tenantId === tenantId && item.periodStart === periodStart,
    );
    if (!invoice) {
      const invoiceId = randomUUID();
      invoice = {
        id: invoiceId,
        tenantId,
        periodStart,
        periodEnd,
        amountUsdc: 0,
        status: "draft",
        statementHash: null,
        settlementTxHash: null,
      };
      this.state.invoices.set(invoiceId, invoice);
    }
    return invoice;
  }

  async recordOverageCharge({ tenantId, agentId, endpoint, reasons, amountUsdc, requestId }) {
    const invoice = this._getOrCreateCurrentInvoice(tenantId);
    invoice.amountUsdc = Number((Number(invoice.amountUsdc || 0) + Number(amountUsdc || 0)).toFixed(6));
    this._recordAudit({
      tenantId,
      agentId,
      actorDid: this._getPrimaryDid(tenantId),
      action: "billing.overage_charge",
      resourceType: "invoice",
      resourceId: invoice.id,
      requestId,
      metadata: {
        endpoint,
        reasons,
        amount_usdc: Number(amountUsdc || 0),
      },
    });
    return {
      invoiceId: invoice.id,
      amountUsdc: invoice.amountUsdc,
    };
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
        qps: this._getTenantQuota(tenant.id).qps,
        mailbox_limit: this._getTenantQuota(tenant.id).mailbox_limit,
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
      const mailboxAccount = [...this.state.mailboxAccountsV2.values()].find((item) => item.legacyMailboxId === mailbox.id) || null;
      const leaseV2 = mailboxAccount
        ? [...this.state.mailboxLeasesV2.values()].find(
            (item) => item.mailboxAccountId === mailboxAccount.id && ["pending", "active", "releasing"].includes(item.status),
          ) || null
        : null;
      return {
        mailbox_id: mailbox.id,
        address: mailbox.address,
        type: mailbox.type || "alias",
        status: mailbox.status,
        tenant_id: mailbox.tenantId,
        agent_id: lease?.agentId || null,
        lease_expires_at: lease?.expiresAt || null,
        mailbox_account_id: mailboxAccount?.id || null,
        mailbox_account_backend_status: mailboxAccount?.backendStatus || null,
        mailbox_lease_v2_id: leaseV2?.id || null,
        lease_v2_status: leaseV2?.status || null,
      };
    });
    if (status) items = items.filter((mailbox) => mailbox.status === status);
    if (tenantId) items = items.filter((mailbox) => mailbox.tenant_id === tenantId);
    items.sort((a, b) => String(a.address).localeCompare(String(b.address)));
    return this._paginate(items, page, pageSize);
  }

  async listMailboxesForReconcile() {
    return [...this.state.mailboxes.values()]
      .map((mailbox) => {
        const lease = this._currentLeaseByMailbox(mailbox.id);
        return {
          mailboxId: mailbox.id,
          tenantId: mailbox.tenantId,
          address: mailbox.address,
          status: mailbox.status,
          providerRef: mailbox.providerRef || null,
          agentId: lease?.agentId || null,
          leaseExpiresAt: lease?.expiresAt || null,
        };
      })
      .sort((a, b) => String(a.address).localeCompare(String(b.address)));
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
      const fallbackMailboxAccount =
        [...this.state.mailboxAccountsV2.values()].find((item) => item.legacyMailboxId === message.mailboxId) || null;
      const fallbackLeaseV2 = fallbackMailboxAccount
        ? [...this.state.mailboxLeasesV2.values()].find(
            (item) => item.mailboxAccountId === fallbackMailboxAccount.id && ["pending", "active", "releasing"].includes(item.status),
          ) || null
        : null;
      const messageV2 = this.state.messagesV2.get(message.id) || null;
      const status = !event
        ? "pending"
        : event.eventType === "otp.extracted"
          ? "parsed"
          : event.eventType === "mail.parse_failed"
            ? "failed"
            : "pending";
      return {
        message_id: message.id,
        mailbox_id: message.mailboxId,
        sender_domain: message.senderDomain,
        subject: message.subject,
        received_at: message.receivedAt,
        parsed_status: status,
        otp_extracted: Boolean(event?.otpCode),
        mailbox_account_id: messageV2?.mailboxAccountId || fallbackMailboxAccount?.id || null,
        mailbox_lease_v2_id: messageV2?.mailboxLeaseId || fallbackLeaseV2?.id || null,
        message_v2_status: messageV2?.messageStatus || (status === "parsed" ? "parsed" : status === "failed" ? "parse_failed" : "received"),
      };
    });
    if (mailboxId) items = items.filter((message) => message.mailbox_id === mailboxId);
    if (parsedStatus) items = items.filter((message) => message.parsed_status === parsedStatus);
    items.sort((a, b) => new Date(b.received_at) - new Date(a.received_at));
    return this._paginate(items, page, pageSize);
  }

  async adminListSendAttempts({ page, pageSize, tenantId, submissionStatus }) {
    let items = [...this.state.sendAttempts.values()].map((attempt) => ({
      send_attempt_id: attempt.id,
      tenant_id: attempt.tenantId,
      agent_id: attempt.agentId,
      mailbox_id: attempt.legacyMailboxId || null,
      mailbox_account_id: attempt.mailboxAccountId,
      from_address: attempt.fromAddress,
      recipient_count: Array.isArray(attempt.to) ? attempt.to.length : 0,
      subject: attempt.subject,
      submission_status: attempt.status,
      backend_queue_id: attempt.backendQueueId,
      smtp_response: attempt.smtpResponse,
      submitted_at: attempt.submittedAt,
      created_at: attempt.createdAt,
      updated_at: attempt.updatedAt,
    }));
    if (tenantId) items = items.filter((attempt) => attempt.tenant_id === tenantId);
    if (submissionStatus) items = items.filter((attempt) => attempt.submission_status === submissionStatus);
    items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return this._paginate(items, page, pageSize);
  }

  async listTenantSendAttemptsV2({ tenantId, mailboxId = null, page, pageSize, submissionStatus = null }) {
    let items = [...this.state.sendAttempts.values()]
      .filter((attempt) => attempt.tenantId === tenantId)
      .filter((attempt) => !mailboxId || attempt.legacyMailboxId === mailboxId)
      .map((attempt) => ({
        send_attempt_id: attempt.id,
        mailbox_id: attempt.legacyMailboxId || null,
        mailbox_account_id: attempt.mailboxAccountId,
        agent_id: attempt.agentId,
        from_address: attempt.fromAddress,
        recipient_count: Array.isArray(attempt.to) ? attempt.to.length : 0,
        subject: attempt.subject,
        submission_status: attempt.status,
        backend_queue_id: attempt.backendQueueId,
        smtp_response: attempt.smtpResponse,
        submitted_at: attempt.submittedAt,
        created_at: attempt.createdAt,
        updated_at: attempt.updatedAt,
      }));
    if (submissionStatus) {
      items = items.filter((attempt) => attempt.submission_status === submissionStatus);
    }
    items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return this._paginate(items, page, pageSize);
  }

  async getTenantSendAttemptV2(tenantId, sendAttemptId) {
    const attempt = this.state.sendAttempts.get(sendAttemptId);
    if (!attempt || attempt.tenantId !== tenantId) return null;
    return {
      send_attempt_id: attempt.id,
      mailbox_id: attempt.legacyMailboxId || null,
      mailbox_account_id: attempt.mailboxAccountId,
      agent_id: attempt.agentId,
      from_address: attempt.fromAddress,
      recipients: attempt.to,
      subject: attempt.subject,
      submission_status: attempt.status,
      backend_queue_id: attempt.backendQueueId,
      smtp_response: attempt.smtpResponse,
      submitted_at: attempt.submittedAt,
      created_at: attempt.createdAt,
      updated_at: attempt.updatedAt,
    };
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

  async adminListWebhookDeliveries({ page, pageSize, tenantId = null, webhookId = null }) {
    let items = this.state.auditLogs
      .filter((entry) => entry.action === "webhook.deliver" && entry.resourceType === "webhook")
      .map((entry) => {
        const webhook = this.state.webhooks.get(entry.resourceId);
        return {
          delivery_log_id: entry.id,
          tenant_id: entry.tenantId,
          webhook_id: entry.resourceId,
          target_url: webhook?.targetUrl || null,
          event_type: entry.metadata?.event_type || null,
          status_code: entry.metadata?.status_code ?? null,
          attempts: entry.metadata?.attempts ?? null,
          ok: entry.metadata?.ok ?? null,
          delivery_id: entry.metadata?.delivery_id || null,
          error_message: entry.metadata?.error_message || null,
          response_excerpt: entry.metadata?.response_excerpt || null,
          request_id: entry.requestId,
          delivered_at: entry.createdAt,
        };
      });
    if (tenantId) items = items.filter((item) => item.tenant_id === tenantId);
    if (webhookId) items = items.filter((item) => item.webhook_id === webhookId);
    items.sort((a, b) => String(b.delivered_at).localeCompare(String(a.delivered_at)));
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
    webhook.secretEnc = encryptSecret(nextSecret, this.webhookSecretEncryptionKey);
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

  async listMessagesForReparse() {
    return [];
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
