import { randomUUID } from "node:crypto";
import { hashSecret, normalizeAddress } from "../utils.js";

export class MemoryStore {
  constructor({ chainId, challengeTtlMs }) {
    this.chainId = chainId;
    this.challengeTtlMs = challengeTtlMs;
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
    };
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
      createdAt: new Date().toISOString(),
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
      const addressName = `${address.slice(2, 8) || "agent"}-${i + 1}@pool.mailcloud.local`;
      this.state.mailboxes.set(mailboxId, {
        id: mailboxId,
        tenantId,
        address: addressName,
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

    return { mailbox, lease: activeLease };
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
    };
    this.state.webhooks.set(webhookId, webhook);
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

  getStateForTests() {
    return this.state;
  }
}
