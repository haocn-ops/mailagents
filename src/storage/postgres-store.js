import { randomUUID } from "node:crypto";
import { hashSecret, normalizeAddress } from "../utils.js";

export class PostgresStore {
  constructor({ databaseUrl, chainId, challengeTtlMs }) {
    this.databaseUrl = databaseUrl;
    this.chainId = chainId;
    this.challengeTtlMs = challengeTtlMs;
    this.pool = null;
    this.challenges = new Map();
  }

  async _ensurePool() {
    if (this.pool) return this.pool;
    if (!this.databaseUrl) {
      throw new Error("DATABASE_URL is required when STORAGE_BACKEND=postgres");
    }

    let pg;
    try {
      pg = await import("pg");
    } catch {
      throw new Error("PostgreSQL backend requires package 'pg'. Run: npm install pg");
    }

    const { Pool } = pg.default || pg;
    this.pool = new Pool({ connectionString: this.databaseUrl });
    return this.pool;
  }

  async _query(text, values = [], client = null) {
    const pool = await this._ensurePool();
    if (client) return client.query(text, values);
    return pool.query(text, values);
  }

  async _withTx(fn) {
    const pool = await this._ensurePool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async saveChallenge(walletAddress, nonce, message) {
    this.challenges.set(normalizeAddress(walletAddress), {
      nonce,
      message,
      createdAt: Date.now(),
    });
  }

  async getChallenge(walletAddress) {
    const challenge = this.challenges.get(normalizeAddress(walletAddress));
    if (!challenge) return null;
    if (Date.now() - challenge.createdAt > this.challengeTtlMs) {
      this.challenges.delete(normalizeAddress(walletAddress));
      return null;
    }
    return challenge;
  }

  async consumeChallenge(walletAddress) {
    this.challenges.delete(normalizeAddress(walletAddress));
  }

  async getOrCreateIdentity(walletAddress) {
    return this._withTx(async (client) => {
      const address = normalizeAddress(walletAddress);

      const existing = await this._query(
        `select tenant_id, did
           from wallet_identities
          where chain_id = $1 and address = $2
          limit 1`,
        [this.chainId, address],
        client,
      );

      if (existing.rowCount > 0) {
        const tenantId = existing.rows[0].tenant_id;
        const did = existing.rows[0].did;
        const agentRes = await this._query(
          `select id from agents where tenant_id = $1 order by created_at asc limit 1`,
          [tenantId],
          client,
        );

        let agentId;
        if (agentRes.rowCount > 0) {
          agentId = agentRes.rows[0].id;
        } else {
          const createdAgent = await this._query(
            `insert into agents (tenant_id, name) values ($1, $2) returning id`,
            [tenantId, "default-agent"],
            client,
          );
          agentId = createdAgent.rows[0].id;
        }

        return { tenantId, agentId, did };
      }

      const createdTenant = await this._query(
        `insert into tenants (name) values ($1) returning id`,
        [`tenant-${address.slice(2, 8) || "anon"}`],
        client,
      );
      const tenantId = createdTenant.rows[0].id;
      const did = `did:pkh:eip155:${this.chainId}:${address}`;

      const createdAgent = await this._query(
        `insert into agents (tenant_id, name) values ($1, $2) returning id`,
        [tenantId, "default-agent"],
        client,
      );
      const agentId = createdAgent.rows[0].id;

      await this._query(
        `insert into wallet_identities (tenant_id, chain_id, address, did, is_primary)
         values ($1, $2, $3, $4, true)`,
        [tenantId, this.chainId, address, did],
        client,
      );

      const mailboxPrefix = address.slice(2, 8) || "agent";
      for (let i = 0; i < 5; i += 1) {
        await this._query(
          `insert into mailboxes (tenant_id, address, status)
           values ($1, $2, 'available')`,
          [tenantId, `${mailboxPrefix}-${i + 1}@pool.mailcloud.local`],
          client,
        );
      }

      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
      await this._query(
        `insert into invoices (tenant_id, period_start, period_end, amount_usdc, status)
         values ($1, $2, $3, 0, 'draft')`,
        [tenantId, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)],
        client,
      );

      return { tenantId, agentId, did };
    });
  }

  async findTenantContext(tenantId, agentId) {
    const result = await this._query(
      `select t.id as tenant_id, a.id as agent_id
         from tenants t
         join agents a on a.tenant_id = t.id
        where t.id = $1 and a.id = $2
        limit 1`,
      [tenantId, agentId],
    );

    if (result.rowCount === 0) return null;
    return {
      tenant: { id: result.rows[0].tenant_id },
      agent: { id: result.rows[0].agent_id },
    };
  }

  async allocateMailbox({ tenantId, agentId, purpose, ttlHours }) {
    return this._withTx(async (client) => {
      const mailboxResult = await this._query(
        `select id, address
           from mailboxes
          where tenant_id = $1 and status = 'available'
          order by created_at asc
          for update skip locked
          limit 1`,
        [tenantId],
        client,
      );

      if (mailboxResult.rowCount === 0) return null;

      const mailbox = mailboxResult.rows[0];
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlHours * 3600 * 1000);

      await this._query(
        `update mailboxes set status = 'leased' where id = $1`,
        [mailbox.id],
        client,
      );

      const leaseResult = await this._query(
        `insert into mailbox_leases (mailbox_id, tenant_id, agent_id, purpose, expires_at, status)
         values ($1, $2, $3, $4, $5, 'active')
         returning id, expires_at`,
        [mailbox.id, tenantId, agentId, purpose, expiresAt.toISOString()],
        client,
      );

      const msgResult = await this._query(
        `insert into messages (mailbox_id, sender, sender_domain, subject, received_at)
         values ($1, 'noreply@example.com', 'example.com', 'Your verification code', now())
         returning id`,
        [mailbox.id],
        client,
      );
      await this._query(
        `insert into message_events (message_id, event_type, otp_code, verification_link)
         values ($1, 'otp.extracted', '123456', 'https://example.com/verify?token=test-token')`,
        [msgResult.rows[0].id],
        client,
      );

      return {
        mailbox: {
          id: mailbox.id,
          address: mailbox.address,
        },
        lease: {
          id: leaseResult.rows[0].id,
          expiresAt: leaseResult.rows[0].expires_at.toISOString(),
        },
      };
    });
  }

  async releaseMailbox({ tenantId, mailboxId }) {
    return this._withTx(async (client) => {
      const mailboxResult = await this._query(
        `select id from mailboxes where id = $1 and tenant_id = $2 limit 1`,
        [mailboxId, tenantId],
        client,
      );
      if (mailboxResult.rowCount === 0) return null;

      await this._query(
        `update mailbox_leases
            set status = 'released', released_at = now()
          where mailbox_id = $1 and tenant_id = $2 and status = 'active'`,
        [mailboxId, tenantId],
        client,
      );

      await this._query(
        `update mailboxes set status = 'available' where id = $1`,
        [mailboxId],
        client,
      );

      return { mailbox: { id: mailboxId }, lease: {} };
    });
  }

  async getLatestMessages({ tenantId, mailboxId, since, limit }) {
    const mailboxCheck = await this._query(
      `select id from mailboxes where id = $1 and tenant_id = $2 limit 1`,
      [mailboxId, tenantId],
    );
    if (mailboxCheck.rowCount === 0) return null;

    const values = [mailboxId];
    let filterSql = "";
    if (since) {
      values.push(since);
      filterSql = `and m.received_at >= $${values.length}`;
    }
    values.push(limit);

    const result = await this._query(
      `select m.id,
              m.sender,
              m.sender_domain,
              m.subject,
              m.received_at,
              (
                select me.otp_code
                  from message_events me
                 where me.message_id = m.id and me.event_type = 'otp.extracted'
                 order by me.created_at desc
                 limit 1
              ) as otp_code,
              (
                select me.verification_link
                  from message_events me
                 where me.message_id = m.id and me.event_type = 'otp.extracted'
                 order by me.created_at desc
                 limit 1
              ) as verification_link
         from messages m
        where m.mailbox_id = $1
          ${filterSql}
        order by m.received_at desc
        limit $${values.length}`,
      values,
    );

    return result.rows.map((row) => ({
      message_id: row.id,
      sender: row.sender,
      sender_domain: row.sender_domain,
      subject: row.subject,
      received_at: row.received_at.toISOString(),
      otp_code: row.otp_code,
      verification_link: row.verification_link,
    }));
  }

  async createWebhook({ tenantId, eventTypes, targetUrl, secret }) {
    const result = await this._query(
      `insert into webhooks (tenant_id, target_url, secret_hash, event_types, status)
       values ($1, $2, $3, $4, 'active')
       returning id, event_types, target_url, status`,
      [tenantId, targetUrl, hashSecret(secret), eventTypes],
    );

    const row = result.rows[0];
    return {
      id: row.id,
      eventTypes: row.event_types,
      targetUrl: row.target_url,
      status: row.status,
    };
  }

  async getInvoice(invoiceId, tenantId) {
    const result = await this._query(
      `select id, tenant_id, period_start, period_end, amount_usdc, status, statement_hash, settlement_tx_hash
         from invoices
        where id = $1 and tenant_id = $2
        limit 1`,
      [invoiceId, tenantId],
    );
    if (result.rowCount === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      periodStart: row.period_start.toISOString().slice(0, 10),
      periodEnd: row.period_end.toISOString().slice(0, 10),
      amountUsdc: Number(row.amount_usdc),
      status: row.status,
      statementHash: row.statement_hash,
      settlementTxHash: row.settlement_tx_hash,
    };
  }

  async recordUsage({ tenantId, agentId, endpoint, quantity = 1, requestId }) {
    await this._query(
      `insert into usage_records (tenant_id, agent_id, endpoint, unit, quantity, request_id)
       values ($1, $2, $3, 'call', $4, $5)`,
      [tenantId, agentId, endpoint, quantity, requestId],
    );
  }

  async usageSummary(tenantId, start, end) {
    const apiCallsResult = await this._query(
      `select coalesce(sum(quantity), 0) as api_calls
         from usage_records
        where tenant_id = $1 and occurred_at >= $2 and occurred_at < $3`,
      [tenantId, start.toISOString(), end.toISOString()],
    );

    const activeMailboxesResult = await this._query(
      `select count(distinct mailbox_id) as active_mailboxes
         from mailbox_leases
        where tenant_id = $1 and status = 'active' and expires_at > now()`,
      [tenantId],
    );

    const messageParsesResult = await this._query(
      `select coalesce(sum(quantity), 0) as message_parses
         from usage_records
        where tenant_id = $1
          and occurred_at >= $2 and occurred_at < $3
          and endpoint = 'GET /v1/messages/latest'`,
      [tenantId, start.toISOString(), end.toISOString()],
    );

    const apiCalls = Number(apiCallsResult.rows[0].api_calls);
    return {
      api_calls: apiCalls,
      active_mailboxes: Number(activeMailboxesResult.rows[0].active_mailboxes),
      message_parses: Number(messageParsesResult.rows[0].message_parses),
      billable_units: apiCalls,
    };
  }

  getStateForTests() {
    return null;
  }
}
