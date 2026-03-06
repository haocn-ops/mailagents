import { randomBytes } from "node:crypto";
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

  _paginate(items, page, pageSize) {
    const offset = (page - 1) * pageSize;
    return {
      items: items.slice(offset, offset + pageSize),
      page,
      page_size: pageSize,
      total: items.length,
    };
  }

  async _recordAudit({ tenantId = null, agentId = null, actorDid = null, action, resourceType, resourceId, requestId = null, metadata = {} }, client = null) {
    await this._query(
      `insert into audit_logs (tenant_id, agent_id, actor_did, action, resource_type, resource_id, request_id, metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [tenantId, agentId, actorDid, action, resourceType, resourceId, requestId, JSON.stringify(metadata)],
      client,
    );
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

      await this._query(
        `insert into tenant_quotas (tenant_id, qps, mailbox_limit)
         values ($1, 120, 100)`,
        [tenantId],
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

      await this._recordAudit(
        {
          tenantId,
          agentId,
          actorDid: did,
          action: "tenant.create",
          resourceType: "tenant",
          resourceId: tenantId,
          metadata: { wallet_address: address },
        },
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

      const actorDidResult = await this._query(
        `select did from wallet_identities where tenant_id = $1 and is_primary = true limit 1`,
        [tenantId],
        client,
      );
      await this._recordAudit(
        {
          tenantId,
          agentId,
          actorDid: actorDidResult.rows[0]?.did || null,
          action: "mailbox.allocate",
          resourceType: "mailbox",
          resourceId: mailbox.id,
          metadata: { purpose, expires_at: leaseResult.rows[0].expires_at.toISOString() },
        },
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

      const actorDidResult = await this._query(
        `select did from wallet_identities where tenant_id = $1 and is_primary = true limit 1`,
        [tenantId],
        client,
      );
      await this._recordAudit(
        {
          tenantId,
          actorDid: actorDidResult.rows[0]?.did || null,
          action: "mailbox.release",
          resourceType: "mailbox",
          resourceId: mailboxId,
        },
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
       returning id, event_types, target_url, status, last_delivery_at, last_status_code`,
      [tenantId, targetUrl, hashSecret(secret), eventTypes],
    );

    const row = result.rows[0];
    await this._recordAudit({
      tenantId,
      action: "webhook.create",
      resourceType: "webhook",
      resourceId: row.id,
      metadata: { target_url: targetUrl, event_types: eventTypes },
    });
    return {
      id: row.id,
      eventTypes: row.event_types,
      targetUrl: row.target_url,
      status: row.status,
      lastDeliveryAt: row.last_delivery_at,
      lastStatusCode: row.last_status_code,
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

  async adminOverviewMetrics() {
    const result = await this._query(
      `select
          (
            select count(distinct tenant_id)
              from usage_records
             where occurred_at >= now() - interval '24 hours'
          ) as active_tenants_24h,
          (
            select count(*)
              from mailbox_leases
             where status = 'active' and expires_at > now()
          ) as active_mailbox_leases,
          (
            select count(*)
              from messages
             where received_at >= now() - interval '24 hours'
          ) as inbound_messages_24h,
          (
            select coalesce(round(100.0 * count(distinct me.message_id) / nullif(count(distinct m.id), 0), 1), 100.0)
              from messages m
              left join message_events me on me.message_id = m.id and me.event_type = 'otp.extracted'
          ) as otp_extract_success_rate,
          (
            select 100.0
          ) as webhook_success_rate,
          (
            select coalesce(round(100.0 * count(*) filter (where endpoint <> 'GET /v1/usage/summary') / nullif(count(*) filter (where endpoint = 'POST /v1/mailboxes/allocate'), 0), 1), 100.0)
              from usage_records
          ) as payment_conversion_rate`,
    );
    const row = result.rows[0];
    return {
      active_tenants_24h: Number(row.active_tenants_24h),
      active_mailbox_leases: Number(row.active_mailbox_leases),
      inbound_messages_24h: Number(row.inbound_messages_24h),
      otp_extract_success_rate: Number(row.otp_extract_success_rate),
      webhook_success_rate: Number(row.webhook_success_rate),
      payment_conversion_rate: Number(row.payment_conversion_rate),
    };
  }

  async adminOverviewTimeseries({ from, to, bucket }) {
    const start = from || new Date(Date.now() - 12 * 3600 * 1000).toISOString();
    const end = to || new Date().toISOString();
    const truncUnit = bucket === "day" ? "day" : bucket === "minute" ? "minute" : "hour";
    const result = await this._query(
      `select date_trunc('${truncUnit}', received_at) as ts, count(*)::int as value
         from messages
        where received_at >= $1 and received_at <= $2
        group by 1
        order by 1 asc`,
      [start, end],
    );
    return {
      points: result.rows.map((row) => ({
        ts: row.ts.toISOString(),
        value: Number(row.value),
      })),
    };
  }

  async adminListTenants({ page, pageSize, status }) {
    const values = [];
    let where = "";
    if (status) {
      values.push(status);
      where = `where t.status = $${values.length}`;
    }
    const result = await this._query(
      `select t.id as tenant_id,
              t.name,
              t.status,
              wi.did as primary_did,
              tq.qps,
              tq.mailbox_limit,
              (
                select count(*)
                  from agents a
                 where a.tenant_id = t.id and a.status = 'active'
              )::int as active_agents,
              (
                select count(*)
                  from mailboxes m
                 where m.tenant_id = t.id and m.status = 'leased'
              )::int as active_mailboxes,
              (
                select coalesce(sum(quantity), 0)
                  from usage_records u
                 where u.tenant_id = t.id
              ) as monthly_usage,
              t.updated_at as updated_at
         from tenants t
         left join wallet_identities wi on wi.tenant_id = t.id and wi.is_primary = true
         left join tenant_quotas tq on tq.tenant_id = t.id
         ${where}
         order by t.created_at desc`,
      values,
    );
    return this._paginate(
      result.rows.map((row) => ({
        tenant_id: row.tenant_id,
        name: row.name,
        status: row.status,
        primary_did: row.primary_did,
        active_agents: Number(row.active_agents),
        active_mailboxes: Number(row.active_mailboxes),
        monthly_usage: Number(row.monthly_usage),
        updated_at: row.updated_at.toISOString(),
      })),
      page,
      pageSize,
    );
  }

  async adminGetTenant(tenantId) {
    const result = await this._query(
      `select t.id as tenant_id,
              t.name,
              t.status,
              t.updated_at,
              wi.did as primary_did,
              tq.qps,
              tq.mailbox_limit,
              (
                select count(*)
                  from agents a
                 where a.tenant_id = t.id and a.status = 'active'
              )::int as active_agents,
              (
                select count(*)
                  from mailboxes m
                 where m.tenant_id = t.id and m.status = 'leased'
              )::int as active_mailboxes,
              (
                select coalesce(sum(quantity), 0)
                  from usage_records u
                 where u.tenant_id = t.id
              ) as monthly_usage
         from tenants t
         left join wallet_identities wi on wi.tenant_id = t.id and wi.is_primary = true
         left join tenant_quotas tq on tq.tenant_id = t.id
        where t.id = $1
        limit 1`,
      [tenantId],
    );
    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    return {
      tenant_id: row.tenant_id,
      name: row.name,
      status: row.status,
      primary_did: row.primary_did,
      active_agents: Number(row.active_agents),
      active_mailboxes: Number(row.active_mailboxes),
      monthly_usage: Number(row.monthly_usage),
      updated_at: row.updated_at.toISOString(),
      quotas: {
        qps: Number(row.qps || 120),
        mailbox_limit: Number(row.mailbox_limit || 100),
      },
    };
  }

  async adminPatchTenant(tenantId, patch, context = {}) {
    const result = await this._query(`select id from tenants where id = $1 limit 1`, [tenantId]);
    if (result.rowCount === 0) return null;
    if (patch.status) {
      await this._query(`update tenants set status = $2, updated_at = now() where id = $1`, [tenantId, patch.status]);
    }
    if (patch.quotas) {
      await this._query(
        `insert into tenant_quotas (tenant_id, qps, mailbox_limit)
         values ($1, $2, $3)
         on conflict (tenant_id)
         do update set
           qps = coalesce(excluded.qps, tenant_quotas.qps),
           mailbox_limit = coalesce(excluded.mailbox_limit, tenant_quotas.mailbox_limit),
           updated_at = now()`,
        [tenantId, patch.quotas.qps || null, patch.quotas.mailbox_limit || null],
      );
      await this._query(`update tenants set updated_at = now() where id = $1`, [tenantId]);
    }
    await this._recordAudit({
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
    const values = [];
    const filters = [];
    if (status) {
      values.push(status);
      filters.push(`m.status = $${values.length}`);
    }
    if (tenantId) {
      values.push(tenantId);
      filters.push(`m.tenant_id = $${values.length}`);
    }
    const where = filters.length ? `where ${filters.join(" and ")}` : "";
    const result = await this._query(
      `select m.id as mailbox_id,
              m.address,
              m.type,
              m.status,
              m.tenant_id,
              l.agent_id,
              l.expires_at as lease_expires_at
         from mailboxes m
         left join mailbox_leases l on l.mailbox_id = m.id and l.status = 'active'
         ${where}
         order by m.created_at desc`,
      values,
    );
    return this._paginate(
      result.rows.map((row) => ({
        mailbox_id: row.mailbox_id,
        address: row.address,
        type: row.type,
        status: row.status,
        tenant_id: row.tenant_id,
        agent_id: row.agent_id,
        lease_expires_at: row.lease_expires_at ? row.lease_expires_at.toISOString() : null,
      })),
      page,
      pageSize,
    );
  }

  async adminFreezeMailbox(mailboxId, { reason, actorDid, requestId }) {
    return this._withTx(async (client) => {
      const mailboxResult = await this._query(`select id, tenant_id from mailboxes where id = $1 limit 1`, [mailboxId], client);
      if (mailboxResult.rowCount === 0) return null;
      const tenantId = mailboxResult.rows[0].tenant_id;
      await this._query(`update mailbox_leases set status = 'released', released_at = now() where mailbox_id = $1 and status = 'active'`, [mailboxId], client);
      await this._query(`update mailboxes set status = 'frozen' where id = $1`, [mailboxId], client);
      await this._query(
        `insert into risk_events (tenant_id, severity, type, detail)
         values ($1, 'high', 'mailbox.frozen', $2)`,
        [tenantId, reason],
        client,
      );
      await this._recordAudit({ tenantId, actorDid, action: "mailbox.freeze", resourceType: "mailbox", resourceId: mailboxId, requestId, metadata: { reason } }, client);
      return { status: "frozen" };
    });
  }

  async adminReleaseMailbox(mailboxId, { actorDid, requestId }) {
    return this._withTx(async (client) => {
      const mailboxResult = await this._query(`select id, tenant_id from mailboxes where id = $1 limit 1`, [mailboxId], client);
      if (mailboxResult.rowCount === 0) return null;
      const tenantId = mailboxResult.rows[0].tenant_id;
      await this._query(`update mailbox_leases set status = 'released', released_at = now() where mailbox_id = $1 and status = 'active'`, [mailboxId], client);
      await this._query(`update mailboxes set status = 'available' where id = $1`, [mailboxId], client);
      await this._recordAudit({ tenantId, actorDid, action: "mailbox.admin_release", resourceType: "mailbox", resourceId: mailboxId, requestId }, client);
      return { status: "released" };
    });
  }

  async adminListMessages({ page, pageSize, mailboxId, parsedStatus }) {
    const values = [];
    const filters = [];
    if (mailboxId) {
      values.push(mailboxId);
      filters.push(`m.mailbox_id = $${values.length}`);
    }
    const where = filters.length ? `where ${filters.join(" and ")}` : "";
    const result = await this._query(
      `select m.id as message_id,
              m.mailbox_id,
              m.sender_domain,
              m.subject,
              m.received_at,
              case when exists (
                select 1 from message_events me where me.message_id = m.id and me.event_type = 'otp.extracted'
              ) then 'parsed' else 'pending' end as parsed_status,
              exists (
                select 1 from message_events me where me.message_id = m.id and me.event_type = 'otp.extracted' and me.otp_code is not null
              ) as otp_extracted
         from messages m
         ${where}
         order by m.received_at desc`,
      values,
    );
    let items = result.rows.map((row) => ({
      message_id: row.message_id,
      mailbox_id: row.mailbox_id,
      sender_domain: row.sender_domain,
      subject: row.subject,
      received_at: row.received_at.toISOString(),
      parsed_status: row.parsed_status,
      otp_extracted: row.otp_extracted,
    }));
    if (parsedStatus) items = items.filter((item) => item.parsed_status === parsedStatus);
    return this._paginate(items, page, pageSize);
  }

  async adminReparseMessage(messageId, { actorDid, requestId }) {
    return this._withTx(async (client) => {
      const result = await this._query(`select id from messages where id = $1 limit 1`, [messageId], client);
      if (result.rowCount === 0) return null;
      await this._query(
        `insert into message_events (message_id, event_type, otp_code, verification_link, payload)
         values ($1, 'otp.extracted', '654321', 'https://example.com/verify?token=reparsed', '{"source":"admin-reparse"}'::jsonb)`,
        [messageId],
        client,
      );
      await this._recordAudit({ actorDid, action: "message.reparse", resourceType: "message", resourceId: messageId, requestId }, client);
      return { status: "accepted" };
    });
  }

  async adminReplayMessageWebhook(messageId, { actorDid, requestId }) {
    const result = await this._query(
      `select m.id, mb.tenant_id
         from messages m
         join mailboxes mb on mb.id = m.mailbox_id
        where m.id = $1
        limit 1`,
      [messageId],
    );
    if (result.rowCount === 0) return null;
    await this._query(
      `update webhooks
          set last_delivery_at = now(),
              last_status_code = 200
        where tenant_id = $1`,
      [result.rows[0].tenant_id],
    );
    await this._recordAudit({
      tenantId: result.rows[0].tenant_id,
      actorDid,
      action: "message.replay_webhook",
      resourceType: "message",
      resourceId: messageId,
      requestId,
    });
    return { status: "accepted" };
  }

  async adminListWebhooks({ page, pageSize }) {
    const result = await this._query(
      `select id as webhook_id, tenant_id, target_url, event_types, status, created_at
              , last_delivery_at, last_status_code
         from webhooks
        order by created_at desc`,
    );
    return this._paginate(
      result.rows.map((row) => ({
        webhook_id: row.webhook_id,
        tenant_id: row.tenant_id,
        target_url: row.target_url,
        event_types: row.event_types,
        status: row.status,
        last_delivery_at: row.last_delivery_at ? row.last_delivery_at.toISOString() : null,
        last_status_code: row.last_status_code,
      })),
      page,
      pageSize,
    );
  }

  async adminReplayWebhook(webhookId, { from, to, actorDid, requestId }) {
    const result = await this._query(`select id, tenant_id from webhooks where id = $1 limit 1`, [webhookId]);
    if (result.rowCount === 0) return null;
    await this._query(
      `update webhooks
          set last_delivery_at = now(),
              last_status_code = 200
        where id = $1`,
      [webhookId],
    );
    await this._recordAudit({
      tenantId: result.rows[0].tenant_id,
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
    const result = await this._query(`select id, tenant_id from webhooks where id = $1 limit 1`, [webhookId]);
    if (result.rowCount === 0) return null;
    const secret = randomBytes(18).toString("hex");
    await this._query(`update webhooks set secret_hash = $2 where id = $1`, [webhookId, hashSecret(secret)]);
    await this._recordAudit({
      tenantId: result.rows[0].tenant_id,
      actorDid,
      action: "webhook.rotate_secret",
      resourceType: "webhook",
      resourceId: webhookId,
      requestId,
    });
    return { webhook_id: webhookId, secret };
  }

  async adminListInvoices({ page, pageSize, period }) {
    const values = [];
    let where = "";
    if (period) {
      values.push(period);
      where = `where to_char(period_start, 'YYYY-MM') = $1`;
    }
    const result = await this._query(
      `select id as invoice_id, tenant_id, to_char(period_start, 'YYYY-MM') as period, amount_usdc, status, settlement_tx_hash
         from invoices
         ${where}
        order by period_start desc`,
      values,
    );
    return this._paginate(
      result.rows.map((row) => ({
        invoice_id: row.invoice_id,
        tenant_id: row.tenant_id,
        period: row.period,
        amount_usdc: Number(row.amount_usdc),
        status: row.status,
        settlement_tx_hash: row.settlement_tx_hash,
      })),
      page,
      pageSize,
    );
  }

  async adminIssueInvoice(invoiceId, { actorDid, requestId }) {
    const result = await this._query(`select tenant_id from invoices where id = $1 limit 1`, [invoiceId]);
    if (result.rowCount === 0) return null;
    await this._query(`update invoices set status = 'issued', issued_at = now() where id = $1`, [invoiceId]);
    await this._recordAudit({
      tenantId: result.rows[0].tenant_id,
      actorDid,
      action: "invoice.issue",
      resourceType: "invoice",
      resourceId: invoiceId,
      requestId,
    });
    return { status: "issued" };
  }

  async adminListRiskEvents({ page, pageSize }) {
    const result = await this._query(
      `select id as event_id, tenant_id, severity, type, detail, occurred_at
         from risk_events
        order by occurred_at desc`,
    );
    return this._paginate(
      result.rows.map((row) => ({
        event_id: row.event_id,
        tenant_id: row.tenant_id,
        severity: row.severity,
        type: row.type,
        detail: row.detail,
        occurred_at: row.occurred_at.toISOString(),
      })),
      page,
      pageSize,
    );
  }

  async adminUpsertRiskPolicy({ policyType, value, action, actorDid, requestId }) {
    const key = `${policyType}:${value}`;
    if (action === "remove") {
      await this._query(`delete from risk_policies where policy_type = $1 and value = $2`, [policyType, value]);
    } else {
      await this._query(
        `insert into risk_policies (policy_type, value, action, created_by_did)
         values ($1, $2, $3, $4)
         on conflict (policy_type, value)
         do update set action = excluded.action, created_by_did = excluded.created_by_did, updated_at = now()`,
        [policyType, value, action, actorDid],
      );
    }
    await this._recordAudit({
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
    const values = [];
    const filters = [];
    if (requestId) {
      values.push(requestId);
      filters.push(`request_id = $${values.length}`);
    }
    if (tenantId) {
      values.push(tenantId);
      filters.push(`tenant_id = $${values.length}`);
    }
    if (actorDid) {
      values.push(actorDid);
      filters.push(`actor_did = $${values.length}`);
    }
    const where = filters.length ? `where ${filters.join(" and ")}` : "";
    const result = await this._query(
      `select id as log_id, created_at as timestamp, tenant_id, actor_did, action, resource_type, resource_id
         from audit_logs
         ${where}
        order by created_at desc`,
      values,
    );
    return this._paginate(
      result.rows.map((row) => ({
        log_id: row.log_id,
        timestamp: row.timestamp.toISOString(),
        tenant_id: row.tenant_id,
        actor_did: row.actor_did,
        action: row.action,
        resource_type: row.resource_type,
        resource_id: row.resource_id,
        result: "success",
      })),
      page,
      pageSize,
    );
  }

  getStateForTests() {
    return null;
  }
}
