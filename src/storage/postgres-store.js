import { randomBytes } from "node:crypto";
import { encryptSecret, hashSecret, normalizeAddress } from "../utils.js";

export class PostgresStore {
  constructor({ databaseUrl, chainId, challengeTtlMs, mailboxDomain = "pool.mailcloud.local", webhookSecretEncryptionKey }) {
    this.databaseUrl = databaseUrl;
    this.chainId = chainId;
    this.challengeTtlMs = challengeTtlMs;
    this.mailboxDomain = mailboxDomain;
    this.webhookSecretEncryptionKey = webhookSecretEncryptionKey;
    this.pool = null;
    this.challenges = new Map();
    this.v2Tables = null;
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

  async _loadV2TableAvailability() {
    if (this.v2Tables) return this.v2Tables;
    const result = await this._query(
      `select
         to_regclass('public.mailbox_accounts') as mailbox_accounts,
         to_regclass('public.mailbox_leases_v2') as mailbox_leases_v2,
         to_regclass('public.raw_messages') as raw_messages,
         to_regclass('public.messages_v2') as messages_v2,
         to_regclass('public.message_parse_results') as message_parse_results,
         to_regclass('public.send_attempts') as send_attempts,
         to_regclass('public.send_attempt_events') as send_attempt_events,
         to_regclass('public.webhook_deliveries') as webhook_deliveries`
    );
    this.v2Tables = {
      mailbox_accounts: Boolean(result.rows[0]?.mailbox_accounts),
      mailbox_leases_v2: Boolean(result.rows[0]?.mailbox_leases_v2),
      raw_messages: Boolean(result.rows[0]?.raw_messages),
      messages_v2: Boolean(result.rows[0]?.messages_v2),
      message_parse_results: Boolean(result.rows[0]?.message_parse_results),
      send_attempts: Boolean(result.rows[0]?.send_attempts),
      send_attempt_events: Boolean(result.rows[0]?.send_attempt_events),
      webhook_deliveries: Boolean(result.rows[0]?.webhook_deliveries),
    };
    return this.v2Tables;
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

  _buildMailboxAddress(prefix, index) {
    return `${prefix}-${index}@${this.mailboxDomain}`;
  }

  _mailboxPrefixForAddress(walletAddress) {
    const compact = normalizeAddress(walletAddress).replace(/^0x/, "");
    return `${compact.slice(0, 6) || "agent"}${compact.slice(-4) || "0000"}`;
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
        [`tenant-${this._mailboxPrefixForAddress(address)}`],
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

      const mailboxPrefix = this._mailboxPrefixForAddress(address);
      for (let i = 0; i < 5; i += 1) {
        await this._query(
          `insert into mailboxes (tenant_id, address, status)
           values ($1, $2, 'available')`,
          [tenantId, this._buildMailboxAddress(mailboxPrefix, i + 1)],
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
      `select t.id as tenant_id, t.status as tenant_status, a.id as agent_id, a.status as agent_status
         from tenants t
         join agents a on a.tenant_id = t.id
        where t.id = $1 and a.id = $2
        limit 1`,
      [tenantId, agentId],
    );

    if (result.rowCount === 0) return null;
    return {
      tenant: { id: result.rows[0].tenant_id, status: result.rows[0].tenant_status },
      agent: { id: result.rows[0].agent_id, status: result.rows[0].agent_status },
    };
  }

  async getTenantPolicy(tenantId) {
    const result = await this._query(
      `select t.id as tenant_id,
              t.status,
              tq.qps,
              tq.mailbox_limit
         from tenants t
         left join tenant_quotas tq on tq.tenant_id = t.id
        where t.id = $1
        limit 1`,
      [tenantId],
    );

    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    return {
      tenantId: row.tenant_id,
      status: row.status,
      quotas: {
        qps: Number(row.qps || 120),
        mailbox_limit: Number(row.mailbox_limit || 100),
      },
    };
  }

  async getRuntimeSettings() {
    const result = await this._query(
      `select key, value
         from app_settings
        where key in ('overage_charge_usdc', 'agent_allocate_hourly_limit')`,
    );
    const settings = {
      overage_charge_usdc: null,
      agent_allocate_hourly_limit: null,
    };
    for (const row of result.rows) {
      if (row.key === "overage_charge_usdc") {
        settings.overage_charge_usdc = Number(row.value?.value ?? row.value);
      }
      if (row.key === "agent_allocate_hourly_limit") {
        settings.agent_allocate_hourly_limit = Number(row.value?.value ?? row.value);
      }
    }
    return settings;
  }

  async updateRuntimeSettings(patch = {}) {
    return this._withTx(async (client) => {
      if (patch.overage_charge_usdc !== undefined) {
        await this._query(
          `insert into app_settings (key, value)
           values ('overage_charge_usdc', $1::jsonb)
           on conflict (key)
           do update set value = excluded.value, updated_at = now()`,
          [JSON.stringify({ value: Number(patch.overage_charge_usdc) })],
          client,
        );
      }
      if (patch.agent_allocate_hourly_limit !== undefined) {
        await this._query(
          `insert into app_settings (key, value)
           values ('agent_allocate_hourly_limit', $1::jsonb)
           on conflict (key)
           do update set value = excluded.value, updated_at = now()`,
          [JSON.stringify({ value: Number(patch.agent_allocate_hourly_limit) })],
          client,
        );
      }
      return this.getRuntimeSettings();
    });
  }

  async allocateMailbox({ tenantId, agentId, purpose, ttlHours }) {
    return this._withTx(async (client) => {
      const mailboxResult = await this._query(
        `select id, address, provider_ref
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
         values ($1, 'noreply@example.com', 'example.com', 'Your verification code', now() - interval '5 seconds')
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
          providerRef: mailbox.provider_ref,
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
        `select id, address, provider_ref from mailboxes where id = $1 and tenant_id = $2 limit 1`,
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

      return {
        mailbox: {
          id: mailboxId,
          address: mailboxResult.rows[0].address,
          providerRef: mailboxResult.rows[0].provider_ref,
        },
        lease: {},
      };
    });
  }

  async listTenantMailboxes(tenantId) {
    const result = await this._query(
      `select mb.id as mailbox_id,
              mb.address,
              mb.status,
              mb.provider_ref,
              mb.created_at,
              (
                select ml.expires_at
                  from mailbox_leases ml
                 where ml.mailbox_id = mb.id and ml.status = 'active'
                 order by ml.started_at desc
                 limit 1
              ) as lease_expires_at
         from mailboxes mb
        where mb.tenant_id = $1
        order by mb.created_at desc, mb.address asc`,
      [tenantId],
    );

    return result.rows.map((row) => ({
      mailbox_id: row.mailbox_id,
      address: row.address,
      status: row.status,
      lease_expires_at: row.lease_expires_at ? row.lease_expires_at.toISOString() : null,
      provider_ref: row.provider_ref,
      updated_at: row.created_at ? row.created_at.toISOString() : null,
    }));
  }

  async saveMailboxProviderRef(mailboxId, providerRef) {
    const result = await this._query(
      `update mailboxes
          set provider_ref = $2
        where id = $1
      returning id, address, provider_ref`,
      [mailboxId, providerRef],
    );
    if (result.rowCount === 0) return null;
    return {
      id: result.rows[0].id,
      address: result.rows[0].address,
      providerRef: result.rows[0].provider_ref,
    };
  }

  async findMailboxByAddress(address) {
    const result = await this._query(
      `select id, tenant_id, address, provider_ref, status
         from mailboxes
        where lower(address) = lower($1)
        limit 1`,
      [address],
    );
    if (result.rowCount === 0) return null;
    return {
      id: result.rows[0].id,
      tenantId: result.rows[0].tenant_id,
      address: result.rows[0].address,
      providerRef: result.rows[0].provider_ref,
      status: result.rows[0].status,
    };
  }

  async getTenantMailbox(tenantId, mailboxId) {
    const result = await this._query(
      `select id, tenant_id, address, provider_ref, status
         from mailboxes
        where id = $1 and tenant_id = $2
        limit 1`,
      [mailboxId, tenantId],
    );
    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      address: row.address,
      providerRef: row.provider_ref,
      status: row.status,
    };
  }

  async listTenantMailboxAccountsV2({ tenantId, page, pageSize }) {
    const tables = await this._loadV2TableAvailability();
    if (!tables.mailbox_accounts) {
      const fallback = await this.listTenantMailboxes(tenantId);
      return this._paginate(
        fallback.map((mailbox) => ({
          mailbox_id: mailbox.mailbox_id,
          mailbox_account_id: null,
          address: mailbox.address,
          domain: String(mailbox.address).split("@")[1] || this.mailboxDomain,
          mailbox_type: "pooled",
          backend_ref: mailbox.provider_ref,
          backend_status: mailbox.status === "leased" ? "active" : "disabled",
          last_password_reset_at: null,
          updated_at: mailbox.updated_at,
        })),
        page,
        pageSize,
      );
    }

    const result = await this._query(
      `select m.id as mailbox_id,
              a.id as mailbox_account_id,
              coalesce(a.address, m.address) as address,
              coalesce(a.domain, split_part(m.address, '@', 2)) as domain,
              coalesce(a.mailbox_type, 'pooled') as mailbox_type,
              coalesce(a.backend_ref, m.provider_ref) as backend_ref,
              coalesce(a.backend_status, case when m.status = 'leased' then 'active' else 'disabled' end) as backend_status,
              a.last_password_reset_at,
              coalesce(a.updated_at, m.created_at) as updated_at
         from mailboxes m
         left join mailbox_accounts a on a.address = m.address
        where m.tenant_id = $1
        order by coalesce(a.updated_at, m.created_at) desc, m.address asc`,
      [tenantId],
    );
    return this._paginate(
      result.rows.map((row) => ({
        mailbox_id: row.mailbox_id,
        mailbox_account_id: row.mailbox_account_id,
        address: row.address,
        domain: row.domain,
        mailbox_type: row.mailbox_type,
        backend_ref: row.backend_ref,
        backend_status: row.backend_status,
        last_password_reset_at: row.last_password_reset_at ? row.last_password_reset_at.toISOString() : null,
        updated_at: row.updated_at ? row.updated_at.toISOString() : null,
      })),
      page,
      pageSize,
    );
  }

  async listTenantMailboxLeasesV2({ tenantId, page, pageSize, leaseStatus = null }) {
    const tables = await this._loadV2TableAvailability();
    if (!tables.mailbox_leases_v2) {
      return this._paginate([], page, pageSize);
    }
    const values = [tenantId];
    let statusFilter = "";
    if (leaseStatus) {
      values.push(leaseStatus);
      statusFilter = `and l.lease_status = $${values.length}`;
    }
    const result = await this._query(
      `select l.id as lease_id,
              m.id as mailbox_id,
              l.mailbox_account_id,
              l.agent_id,
              l.purpose,
              l.lease_status,
              l.started_at,
              l.ends_at,
              l.released_at,
              a.address,
              l.created_at,
              l.updated_at
         from mailbox_leases_v2 l
         join mailbox_accounts a on a.id = l.mailbox_account_id
         left join mailboxes m on m.address = a.address
        where l.tenant_id = $1
          ${statusFilter}
        order by l.created_at desc`,
      values,
    );
    return this._paginate(
      result.rows.map((row) => ({
        lease_id: row.lease_id,
        mailbox_id: row.mailbox_id,
        mailbox_account_id: row.mailbox_account_id,
        agent_id: row.agent_id,
        purpose: row.purpose,
        lease_status: row.lease_status,
        started_at: row.started_at ? row.started_at.toISOString() : null,
        ends_at: row.ends_at ? row.ends_at.toISOString() : null,
        released_at: row.released_at ? row.released_at.toISOString() : null,
        address: row.address,
        created_at: row.created_at ? row.created_at.toISOString() : null,
        updated_at: row.updated_at ? row.updated_at.toISOString() : null,
      })),
      page,
      pageSize,
    );
  }

  async getTenantMailboxLeaseV2(tenantId, leaseId) {
    const tables = await this._loadV2TableAvailability();
    if (!tables.mailbox_leases_v2) return null;
    const result = await this._query(
      `select l.id as lease_id,
              m.id as mailbox_id,
              l.mailbox_account_id,
              l.agent_id,
              l.purpose,
              l.lease_status,
              l.started_at,
              l.ends_at,
              l.released_at,
              a.address,
              l.created_at,
              l.updated_at
         from mailbox_leases_v2 l
         join mailbox_accounts a on a.id = l.mailbox_account_id
         left join mailboxes m on m.address = a.address
        where l.id = $1
          and l.tenant_id = $2
        limit 1`,
      [leaseId, tenantId],
    );
    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    return {
      lease_id: row.lease_id,
      mailbox_id: row.mailbox_id,
      mailbox_account_id: row.mailbox_account_id,
      agent_id: row.agent_id,
      purpose: row.purpose,
      lease_status: row.lease_status,
      started_at: row.started_at ? row.started_at.toISOString() : null,
      ends_at: row.ends_at ? row.ends_at.toISOString() : null,
      released_at: row.released_at ? row.released_at.toISOString() : null,
      address: row.address,
      created_at: row.created_at ? row.created_at.toISOString() : null,
      updated_at: row.updated_at ? row.updated_at.toISOString() : null,
    };
  }

  async upsertMailboxAccountFromLegacyMailbox(mailbox) {
    const tables = await this._loadV2TableAvailability();
    if (!tables.mailbox_accounts) return null;

    const result = await this._query(
      `insert into mailbox_accounts (address, domain, backend_ref, backend_status, mailbox_type, created_at, updated_at)
       values ($1, $2, $3, $4, 'pooled', now(), now())
       on conflict (address)
       do update set
         backend_ref = excluded.backend_ref,
         backend_status = excluded.backend_status,
         updated_at = now()
       returning id, address, domain, backend_ref, backend_status, mailbox_type, last_password_reset_at, created_at, updated_at`,
      [
        mailbox.address,
        String(mailbox.address).split("@")[1] || this.mailboxDomain,
        mailbox.providerRef || null,
        mailbox.status === "leased" ? "active" : "disabled",
      ],
    );

    const row = result.rows[0];
    return {
      id: row.id,
      address: row.address,
      domain: row.domain,
      backendRef: row.backend_ref,
      backendStatus: row.backend_status,
      mailboxType: row.mailbox_type,
      lastPasswordResetAt: row.last_password_reset_at ? row.last_password_reset_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async createMailboxLeaseV2({ mailboxAccountId, tenantId, agentId, purpose, endsAt }) {
    const tables = await this._loadV2TableAvailability();
    if (!tables.mailbox_leases_v2) return null;
    const result = await this._query(
      `insert into mailbox_leases_v2
        (mailbox_account_id, tenant_id, agent_id, lease_status, purpose, ends_at, created_at, updated_at)
       values ($1, $2, $3, 'pending', $4, $5, now(), now())
       returning id, mailbox_account_id, tenant_id, agent_id, lease_status, purpose, started_at, ends_at, released_at, created_at, updated_at`,
      [mailboxAccountId, tenantId, agentId, purpose, endsAt],
    );
    const row = result.rows[0];
    return {
      id: row.id,
      mailboxAccountId: row.mailbox_account_id,
      tenantId: row.tenant_id,
      agentId: row.agent_id,
      status: row.lease_status,
      purpose: row.purpose,
      startedAt: row.started_at ? row.started_at.toISOString() : null,
      endsAt: row.ends_at.toISOString(),
      releasedAt: row.released_at ? row.released_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async markMailboxAccountProvisioned({ mailboxAccountId, providerRef = null }) {
    const tables = await this._loadV2TableAvailability();
    if (!tables.mailbox_accounts) return null;
    await this._query(
      `update mailbox_accounts
          set backend_status = 'active',
              backend_ref = coalesce($2, backend_ref),
              updated_at = now()
        where id = $1`,
      [mailboxAccountId, providerRef],
    );
    return { id: mailboxAccountId };
  }

  async markMailboxLeaseV2Active(leaseId) {
    const tables = await this._loadV2TableAvailability();
    if (!tables.mailbox_leases_v2) return null;
    await this._query(
      `update mailbox_leases_v2
          set lease_status = 'active',
              started_at = coalesce(started_at, now()),
              updated_at = now()
        where id = $1`,
      [leaseId],
    );
    return { id: leaseId };
  }

  async getActiveMailboxLeaseV2ByLegacyMailboxId(legacyMailboxId) {
    const tables = await this._loadV2TableAvailability();
    if (!tables.mailbox_accounts || !tables.mailbox_leases_v2) return null;
    const mailbox = await this._query(`select address from mailboxes where id = $1 limit 1`, [legacyMailboxId]);
    if (mailbox.rowCount === 0) return null;
    const result = await this._query(
      `select l.id, l.mailbox_account_id, l.tenant_id, l.agent_id, l.lease_status, l.purpose, l.started_at, l.ends_at, l.released_at,
              a.address
         from mailbox_leases_v2 l
         join mailbox_accounts a on a.id = l.mailbox_account_id
        where a.address = $1
          and l.lease_status = 'active'
        order by l.created_at desc
        limit 1`,
      [mailbox.rows[0].address],
    );
    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      mailboxAccountId: row.mailbox_account_id,
      tenantId: row.tenant_id,
      agentId: row.agent_id,
      status: row.lease_status,
      purpose: row.purpose,
      startedAt: row.started_at ? row.started_at.toISOString() : null,
      endsAt: row.ends_at.toISOString(),
      releasedAt: row.released_at ? row.released_at.toISOString() : null,
    };
  }

  async markMailboxAccountReleased(mailboxAccountId) {
    const tables = await this._loadV2TableAvailability();
    if (!tables.mailbox_accounts) return null;
    await this._query(
      `update mailbox_accounts
          set backend_status = 'disabled',
              updated_at = now()
        where id = $1`,
      [mailboxAccountId],
    );
    return { id: mailboxAccountId };
  }

  async markMailboxLeaseV2Released(leaseId) {
    const tables = await this._loadV2TableAvailability();
    if (!tables.mailbox_leases_v2) return null;
    await this._query(
      `update mailbox_leases_v2
          set lease_status = 'released',
              released_at = now(),
              updated_at = now()
        where id = $1`,
      [leaseId],
    );
    return { id: leaseId };
  }

  async markMailboxAccountCredentialsReset(mailboxAccountId) {
    const tables = await this._loadV2TableAvailability();
    if (!tables.mailbox_accounts) return null;
    await this._query(
      `update mailbox_accounts
          set last_password_reset_at = now(),
              updated_at = now()
        where id = $1`,
      [mailboxAccountId],
    );
    return { id: mailboxAccountId };
  }

  async createSendAttempt({ tenantId, agentId, mailboxAccountId, legacyMailboxId, fromAddress, to, subject }) {
    const tables = await this._loadV2TableAvailability();
    if (!tables.send_attempts) {
      return { id: `legacy-${legacyMailboxId}-${Date.now()}`, status: "queued" };
    }
    const result = await this._query(
      `insert into send_attempts
        (tenant_id, agent_id, mailbox_account_id, from_address, to_json, subject, submission_status, created_at, updated_at)
       values ($1, $2, $3, $4, $5::jsonb, $6, 'queued', now(), now())
       returning id, submission_status`,
      [tenantId, agentId, mailboxAccountId, fromAddress, JSON.stringify(to), subject],
    );
    if (tables.send_attempt_events) {
      await this._query(
        `insert into send_attempt_events (send_attempt_id, event_type, payload)
         values ($1, 'queued', '{}'::jsonb)`,
        [result.rows[0].id],
      );
    }
    return { id: result.rows[0].id, status: result.rows[0].submission_status };
  }

  async completeSendAttempt({ sendAttemptId, backendQueueId = null, smtpResponse = null }) {
    const tables = await this._loadV2TableAvailability();
    if (!tables.send_attempts) return null;
    await this._query(
      `update send_attempts
          set submission_status = 'accepted',
              backend_queue_id = $2,
              smtp_response = $3,
              submitted_at = now(),
              updated_at = now()
        where id = $1`,
      [sendAttemptId, backendQueueId, smtpResponse],
    );
    if (tables.send_attempt_events) {
      await this._query(
        `insert into send_attempt_events (send_attempt_id, event_type, payload)
         values ($1, 'accepted', $2::jsonb)`,
        [sendAttemptId, JSON.stringify({ backend_queue_id: backendQueueId, smtp_response: smtpResponse })],
      );
    }
    return { id: sendAttemptId };
  }

  async failSendAttempt({ sendAttemptId, errorMessage }) {
    const tables = await this._loadV2TableAvailability();
    if (!tables.send_attempts) return null;
    await this._query(
      `update send_attempts
          set submission_status = 'failed',
              smtp_response = $2,
              updated_at = now()
        where id = $1`,
      [sendAttemptId, errorMessage],
    );
    if (tables.send_attempt_events) {
      await this._query(
        `insert into send_attempt_events (send_attempt_id, event_type, payload)
         values ($1, 'failed', $2::jsonb)`,
        [sendAttemptId, JSON.stringify({ error: errorMessage })],
      );
    }
    return { id: sendAttemptId };
  }

  async getActiveLeaseByMailboxId(mailboxId) {
    const result = await this._query(
      `select id, tenant_id, agent_id, purpose, status, started_at, expires_at, released_at
         from mailbox_leases
        where mailbox_id = $1 and status = 'active'
        order by started_at desc
        limit 1`,
      [mailboxId],
    );
    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      agentId: row.agent_id,
      purpose: row.purpose,
      status: row.status,
      startedAt: row.started_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      releasedAt: row.released_at ? row.released_at.toISOString() : null,
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
    return this._withTx(async (client) => {
      const mailboxResult = await this._query(
        `select id from mailboxes where id = $1 and tenant_id = $2 limit 1`,
        [mailboxId, tenantId],
        client,
      );
      if (mailboxResult.rowCount === 0) return null;

      if (providerMessageId) {
        const existing = await this._query(
          `select id
             from messages
            where mailbox_id = $1 and provider_message_id = $2
            limit 1`,
          [mailboxId, providerMessageId],
          client,
        );
        if (existing.rowCount > 0) {
          return { tenantId, mailboxId, messageId: existing.rows[0].id, deduped: true };
        }
      }

      const messageResult = await this._query(
        `insert into messages (mailbox_id, provider_message_id, sender, sender_domain, subject, raw_ref, received_at)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning id`,
        [mailboxId, providerMessageId, sender, senderDomain, subject, rawRef, receivedAt],
        client,
      );
      const messageId = messageResult.rows[0].id;

      await this._query(
        `insert into message_events (message_id, event_type, payload)
         values ($1, 'mail.received', $2::jsonb)`,
        [messageId, JSON.stringify(payload)],
        client,
      );

      await this._recordAudit(
        {
          tenantId,
          actorDid: "system:mailu",
          action: "message.ingest",
          resourceType: "message",
          resourceId: messageId,
          requestId,
          metadata: { mailbox_id: mailboxId, sender_domain: senderDomain },
        },
        client,
      );

      const tables = await this._loadV2TableAvailability();
      if (tables.raw_messages && tables.messages_v2) {
        const mailboxLookup = await this._query(
          `select id, tenant_id, address, provider_ref, status
             from mailboxes
            where id = $1
            limit 1`,
          [mailboxId],
          client,
        );
        const mailbox = mailboxLookup.rowCount ? {
          id: mailboxLookup.rows[0].id,
          tenantId: mailboxLookup.rows[0].tenant_id,
          address: mailboxLookup.rows[0].address,
          providerRef: mailboxLookup.rows[0].provider_ref,
          status: mailboxLookup.rows[0].status,
        } : null;
        const mailboxAccount = mailbox
          ? await this.upsertMailboxAccountFromLegacyMailbox(mailbox)
          : null;
        const activeLease = await this.getActiveLeaseByMailboxId(mailboxId);

        const rawInsert = await this._query(
          `insert into raw_messages
            (mailbox_account_id, backend_message_id, raw_ref, headers_json, sender, sender_domain, subject, received_at, ingested_at)
           values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, now())
           on conflict (mailbox_account_id, backend_message_id)
           do update set
             raw_ref = excluded.raw_ref,
             headers_json = excluded.headers_json,
             sender = excluded.sender,
             sender_domain = excluded.sender_domain,
             subject = excluded.subject,
             received_at = excluded.received_at
           returning id`,
          [
            mailboxAccount?.id || mailboxId,
            providerMessageId,
            rawRef,
            JSON.stringify(payload.headers || {}),
            sender,
            senderDomain,
            subject,
            receivedAt,
          ],
          client,
        );

        await this._query(
          `insert into messages_v2
            (id, raw_message_id, tenant_id, agent_id, mailbox_account_id, mailbox_lease_id, from_address, subject, received_at, message_status, created_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'received', now())
           on conflict (id)
           do nothing`,
          [
            messageId,
            rawInsert.rows[0].id,
            tenantId,
            activeLease?.agentId || null,
            mailboxAccount?.id || mailboxId,
            activeLease?.id || null,
            sender,
            subject,
            receivedAt,
          ],
          client,
        );
      }

      return { tenantId, mailboxId, messageId };
    });
  }

  async recordMailboxBackendEvent({ tenantId, mailboxId, action, requestId = null, metadata = {} }) {
    const mailboxResult = await this._query(
      `select id from mailboxes where id = $1 and tenant_id = $2 limit 1`,
      [mailboxId, tenantId],
    );
    if (mailboxResult.rowCount === 0) return null;

    await this._recordAudit({
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
    const result = await this._query(
      `select m.id as message_id, m.mailbox_id, mb.tenant_id, m.provider_message_id, m.sender, m.sender_domain, m.subject, m.raw_ref, m.received_at
         from messages m
         join mailboxes mb on mb.id = m.mailbox_id
        where m.id = $1
        limit 1`,
      [messageId],
    );
    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    return {
      messageId: row.message_id,
      tenantId: row.tenant_id,
      mailboxId: row.mailbox_id,
      providerMessageId: row.provider_message_id,
      sender: row.sender,
      senderDomain: row.sender_domain,
      subject: row.subject,
      rawRef: row.raw_ref,
      receivedAt: row.received_at.toISOString(),
    };
  }

  async getTenantMessageDetail(tenantId, messageId) {
    const result = await this._query(
      `select m.id as message_id,
              m.mailbox_id,
              m.sender,
              m.sender_domain,
              m.subject,
              m.raw_ref,
              m.received_at,
              case when exists (
                select 1 from message_events me where me.message_id = m.id and me.event_type = 'otp.extracted'
              ) then 'parsed'
              when exists (
                select 1 from message_events me where me.message_id = m.id and me.event_type = 'mail.parse_failed'
              ) then 'failed'
              else 'pending' end as parsed_status,
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
         join mailboxes mb on mb.id = m.mailbox_id
        where m.id = $1
          and mb.tenant_id = $2
        limit 1`,
      [messageId, tenantId],
    );
    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    return {
      message_id: row.message_id,
      mailbox_id: row.mailbox_id,
      sender: row.sender,
      sender_domain: row.sender_domain,
      subject: row.subject,
      raw_ref: row.raw_ref,
      received_at: row.received_at.toISOString(),
      otp_code: row.otp_code,
      verification_link: row.verification_link,
      parsed_status: row.parsed_status,
    };
  }

  async listTenantMessagesV2({ tenantId, mailboxId = null, page, pageSize, messageStatus = null }) {
    const tables = await this._loadV2TableAvailability();
    const values = [tenantId];
    const filters = [`mv2.tenant_id = $1`];
    if (mailboxId) {
      values.push(mailboxId);
      filters.push(`m.id = $${values.length}`);
    }
    if (messageStatus) {
      values.push(messageStatus);
      filters.push(`mv2.message_status = $${values.length}`);
    }
    const where = `where ${filters.join(" and ")}`;

    if (!tables.messages_v2) {
      const result = await this._query(
        `select msg.id as message_id,
                msg.mailbox_id,
                msg.sender as from_address,
                msg.subject,
                msg.received_at,
                case when exists (
                  select 1 from message_events me where me.message_id = msg.id and me.event_type = 'otp.extracted'
                ) then 'parsed'
                when exists (
                  select 1 from message_events me where me.message_id = msg.id and me.event_type = 'mail.parse_failed'
                ) then 'parse_failed'
                else 'received' end as message_status,
                (
                  select me.otp_code from message_events me where me.message_id = msg.id and me.event_type = 'otp.extracted' order by me.created_at desc limit 1
                ) as otp_code,
                (
                  select me.verification_link from message_events me where me.message_id = msg.id and me.event_type = 'otp.extracted' order by me.created_at desc limit 1
                ) as verification_link
           from messages msg
           join mailboxes m on m.id = msg.mailbox_id
          where m.tenant_id = $1
            ${mailboxId ? `and m.id = $${values.indexOf(mailboxId) + 1}` : ""}
          order by msg.received_at desc`,
        values.slice(0, mailboxId ? 2 : 1),
      );
      let items = result.rows.map((row) => ({
        message_id: row.message_id,
        mailbox_id: row.mailbox_id,
        mailbox_account_id: null,
        mailbox_lease_id: null,
        from_address: row.from_address,
        subject: row.subject,
        received_at: row.received_at.toISOString(),
        message_status: row.message_status,
        otp_code: row.otp_code,
        verification_link: row.verification_link,
        parser_version: null,
      }));
      if (messageStatus) items = items.filter((item) => item.message_status === messageStatus);
      return this._paginate(items, page, pageSize);
    }

    const result = await this._query(
      `select mv2.id as message_id,
              m.id as mailbox_id,
              mv2.mailbox_account_id,
              mv2.mailbox_lease_id,
              mv2.from_address,
              mv2.subject,
              mv2.received_at,
              mv2.message_status,
              pr.otp_code,
              pr.verification_link,
              pr.parser_version
         from messages_v2 mv2
         left join mailbox_accounts a on a.id = mv2.mailbox_account_id
         left join mailboxes m on m.address = a.address
         left join lateral (
           select parser_version, otp_code, verification_link
             from message_parse_results
            where message_id = mv2.id
            order by created_at desc
            limit 1
         ) pr on true
         ${where}
        order by mv2.received_at desc`,
      values,
    );
    return this._paginate(
      result.rows.map((row) => ({
        message_id: row.message_id,
        mailbox_id: row.mailbox_id,
        mailbox_account_id: row.mailbox_account_id,
        mailbox_lease_id: row.mailbox_lease_id,
        from_address: row.from_address,
        subject: row.subject,
        received_at: row.received_at.toISOString(),
        message_status: row.message_status,
        otp_code: row.otp_code,
        verification_link: row.verification_link,
        parser_version: row.parser_version,
      })),
      page,
      pageSize,
    );
  }

  async getTenantMessageDetailV2(tenantId, messageId) {
    const tables = await this._loadV2TableAvailability();
    if (!tables.messages_v2) {
      const fallback = await this.getTenantMessageDetail(tenantId, messageId);
      if (!fallback) return null;
      return {
        message_id: fallback.message_id,
        mailbox_id: fallback.mailbox_id,
        mailbox_account_id: null,
        mailbox_lease_id: null,
        from_address: fallback.sender,
        subject: fallback.subject,
        received_at: fallback.received_at,
        message_status: fallback.parsed_status === "parsed" ? "parsed" : fallback.parsed_status === "failed" ? "parse_failed" : "received",
        otp_code: fallback.otp_code,
        verification_link: fallback.verification_link,
        parser_version: null,
        parse_status: fallback.parsed_status,
        text_excerpt: null,
        confidence: null,
        error_code: null,
      };
    }

    const result = await this._query(
      `select mv2.id as message_id,
              m.id as mailbox_id,
              mv2.mailbox_account_id,
              mv2.mailbox_lease_id,
              mv2.from_address,
              mv2.subject,
              mv2.received_at,
              mv2.message_status,
              pr.parser_version,
              pr.parse_status,
              pr.otp_code,
              pr.verification_link,
              pr.text_excerpt,
              pr.confidence,
              pr.error_code
         from messages_v2 mv2
         left join mailbox_accounts a on a.id = mv2.mailbox_account_id
         left join mailboxes m on m.address = a.address
         left join lateral (
           select parser_version, parse_status, otp_code, verification_link, text_excerpt, confidence, error_code
             from message_parse_results
            where message_id = mv2.id
            order by created_at desc
            limit 1
         ) pr on true
        where mv2.id = $1
          and mv2.tenant_id = $2
        limit 1`,
      [messageId, tenantId],
    );
    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    return {
      message_id: row.message_id,
      mailbox_id: row.mailbox_id,
      mailbox_account_id: row.mailbox_account_id,
      mailbox_lease_id: row.mailbox_lease_id,
      from_address: row.from_address,
      subject: row.subject,
      received_at: row.received_at.toISOString(),
      message_status: row.message_status,
      otp_code: row.otp_code,
      verification_link: row.verification_link,
      parser_version: row.parser_version,
      parse_status: row.parse_status,
      text_excerpt: row.text_excerpt,
      confidence: row.confidence == null ? null : Number(row.confidence),
      error_code: row.error_code,
    };
  }

  async applyMessageParseResult({ messageId, otpCode, verificationLink, payload = {}, requestId = null }) {
    return this._withTx(async (client) => {
      const message = await this.getMessage(messageId);
      if (!message) return null;
      await this._query(
        `insert into message_events (message_id, event_type, otp_code, verification_link, payload)
         values ($1, $2, $3, $4, $5::jsonb)`,
        [
          messageId,
          otpCode || verificationLink ? "otp.extracted" : "mail.parse_failed",
          otpCode || null,
          verificationLink || null,
          JSON.stringify(payload),
        ],
        client,
      );
      await this._recordAudit(
        {
          tenantId: message.tenantId,
          actorDid: "system:parser",
          action: "message.parsed",
          resourceType: "message",
          resourceId: messageId,
          requestId,
          metadata: { otp_extracted: Boolean(otpCode), verification_link: Boolean(verificationLink) },
        },
        client,
      );

      const tables = await this._loadV2TableAvailability();
      if (tables.messages_v2 && tables.message_parse_results) {
        await this._query(
          `update messages_v2
              set message_status = $2
            where id = $1`,
          [messageId, otpCode || verificationLink ? "parsed" : "parse_failed"],
          client,
        );
        await this._query(
          `insert into message_parse_results
            (message_id, parser_version, parse_status, otp_code, verification_link, text_excerpt, confidence, error_code, created_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
          [
            messageId,
            String(payload.parser || "builtin"),
            otpCode || verificationLink ? "parsed" : "failed",
            otpCode || null,
            verificationLink || null,
            payload.text_excerpt || null,
            otpCode || verificationLink ? 0.9 : 0.0,
            otpCode || verificationLink ? null : "NO_MATCH",
          ],
          client,
        );
      }

      return { messageId };
    });
  }

  async listActiveWebhooksByEvent(tenantId, eventType) {
    const result = await this._query(
      `select id, tenant_id, target_url, secret_hash, secret_enc, event_types, status, last_delivery_at, last_status_code
         from webhooks
        where tenant_id = $1
          and status = 'active'
          and $2 = any(event_types)`,
      [tenantId, eventType],
    );
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      targetUrl: row.target_url,
      secretHash: row.secret_hash,
      secretEnc: row.secret_enc,
      eventTypes: row.event_types,
      status: row.status,
      lastDeliveryAt: row.last_delivery_at ? row.last_delivery_at.toISOString() : null,
      lastStatusCode: row.last_status_code,
    }));
  }

  async recordWebhookDelivery(webhookId, { statusCode, requestId = null, metadata = {} }) {
    return this._withTx(async (client) => {
      const tables = await this._loadV2TableAvailability();
      const result = await this._query(
        `update webhooks
            set last_delivery_at = now(),
                last_status_code = $2
          where id = $1
        returning tenant_id`,
        [webhookId, statusCode],
        client,
      );
      if (result.rowCount === 0) return null;
      if (tables.webhook_deliveries) {
        await this._query(
          `insert into webhook_deliveries
            (webhook_id, event_type, resource_id, attempt_number, delivery_status, response_code, response_excerpt, error_message, request_id, delivered_at, created_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())`,
          [
            webhookId,
            metadata.event_type || "unknown",
            metadata.resource_id || webhookId,
            Number(metadata.attempts || 1),
            metadata.ok ? "delivered" : "failed",
            statusCode,
            metadata.response_excerpt || null,
            metadata.error_message || null,
            requestId,
          ],
          client,
        );
      }
      await this._recordAudit(
        {
          tenantId: result.rows[0].tenant_id,
          actorDid: "system:webhook",
          action: "webhook.deliver",
          resourceType: "webhook",
          resourceId: webhookId,
          requestId,
          metadata: { status_code: statusCode, ...metadata },
        },
        client,
      );
      return { webhookId };
    });
  }

  async getWebhook(webhookId) {
    const result = await this._query(
      `select id, tenant_id, target_url, secret_hash, secret_enc, event_types, status, last_delivery_at, last_status_code
         from webhooks
        where id = $1
        limit 1`,
      [webhookId],
    );
    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      targetUrl: row.target_url,
      secretHash: row.secret_hash,
      secretEnc: row.secret_enc,
      eventTypes: row.event_types,
      status: row.status,
      lastDeliveryAt: row.last_delivery_at ? row.last_delivery_at.toISOString() : null,
      lastStatusCode: row.last_status_code,
    };
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
      `insert into webhooks (tenant_id, target_url, secret_hash, secret_enc, event_types, status)
       values ($1, $2, $3, $4, $5, 'active')
       returning id, event_types, target_url, status, last_delivery_at, last_status_code`,
      [tenantId, targetUrl, hashSecret(secret), encryptSecret(secret, this.webhookSecretEncryptionKey), eventTypes],
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

  async listTenantWebhooks(tenantId) {
    const result = await this._query(
      `select id as webhook_id, event_types, target_url, status, last_delivery_at, last_status_code
         from webhooks
        where tenant_id = $1
        order by created_at desc`,
      [tenantId],
    );

    return result.rows.map((row) => ({
      webhook_id: row.webhook_id,
      event_types: row.event_types,
      target_url: row.target_url,
      status: row.status,
      last_delivery_at: row.last_delivery_at ? row.last_delivery_at.toISOString() : null,
      last_status_code: row.last_status_code,
    }));
  }

  async listTenantWebhookDeliveries({ tenantId, page, pageSize, webhookId = null }) {
    const tables = await this._loadV2TableAvailability();
    const values = [tenantId];
    let webhookFilter = "";
    if (webhookId) {
      values.push(webhookId);
      webhookFilter = tables.webhook_deliveries ? `and wd.webhook_id = $${values.length}` : `and al.resource_id = $${values.length}`;
    }
    const result = await this._query(
      tables.webhook_deliveries
        ? `select wd.id as delivery_log_id,
                  wd.webhook_id,
                  w.target_url,
                  wd.event_type,
                  wd.response_code as status_code,
                  wd.attempt_number as attempts,
                  wd.delivery_status = 'delivered' as ok,
                  null::text as delivery_id,
                  wd.error_message,
                  wd.response_excerpt,
                  wd.request_id,
                  wd.delivered_at
             from webhook_deliveries wd
             join webhooks w on w.id = wd.webhook_id
            where w.tenant_id = $1
              ${webhookFilter}
            order by wd.created_at desc`
        : `select al.id as delivery_log_id,
                  al.resource_id as webhook_id,
                  w.target_url,
                  al.metadata->>'event_type' as event_type,
                  nullif(al.metadata->>'status_code', '')::int as status_code,
                  nullif(al.metadata->>'attempts', '')::int as attempts,
                  case
                    when al.metadata ? 'ok' then (al.metadata->>'ok')::boolean
                    else null
                  end as ok,
                  al.metadata->>'delivery_id' as delivery_id,
                  al.metadata->>'error_message' as error_message,
                  al.metadata->>'response_excerpt' as response_excerpt,
                  al.request_id,
                  al.created_at as delivered_at
             from audit_logs al
             left join webhooks w on w.id = al.resource_id
            where al.tenant_id = $1
              and al.action = 'webhook.deliver'
              and al.resource_type = 'webhook'
              ${webhookFilter}
            order by al.created_at desc`,
      values,
    );
    return this._paginate(
      result.rows.map((row) => ({
        delivery_log_id: row.delivery_log_id,
        webhook_id: row.webhook_id,
        target_url: row.target_url,
        event_type: row.event_type,
        status_code: row.status_code,
        attempts: row.attempts,
        ok: row.ok,
        delivery_id: row.delivery_id,
        error_message: row.error_message,
        response_excerpt: row.response_excerpt,
        request_id: row.request_id,
        delivered_at: row.delivered_at ? row.delivered_at.toISOString() : null,
      })),
      page,
      pageSize,
    );
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

  async listTenantInvoices(tenantId, period = null) {
    const values = [tenantId];
    let where = `where tenant_id = $1`;
    if (period) {
      values.push(period);
      where += ` and to_char(period_start, 'YYYY-MM') = $2`;
    }
    const result = await this._query(
      `select id as invoice_id,
              to_char(period_start, 'YYYY-MM') as period,
              period_start,
              period_end,
              amount_usdc,
              status,
              settlement_tx_hash
         from invoices
         ${where}
        order by period_start desc`,
      values,
    );
    return result.rows.map((row) => ({
      invoice_id: row.invoice_id,
      period: row.period,
      amount_usdc: Number(row.amount_usdc),
      status: row.status,
      period_start: row.period_start.toISOString().slice(0, 10),
      period_end: row.period_end.toISOString().slice(0, 10),
      settlement_tx_hash: row.settlement_tx_hash,
    }));
  }

  async recordUsage({ tenantId, agentId, endpoint, quantity = 1, requestId }) {
    await this._query(
      `insert into usage_records (tenant_id, agent_id, endpoint, unit, quantity, request_id)
       values ($1, $2, $3, 'call', $4, $5)`,
      [tenantId, agentId, endpoint, quantity, requestId],
    );
  }

  async countTenantUsageSince(tenantId, since) {
    const result = await this._query(
      `select coalesce(sum(quantity), 0) as total
         from usage_records
        where tenant_id = $1 and occurred_at >= $2`,
      [tenantId, since.toISOString()],
    );
    return Number(result.rows[0].total);
  }

  async countAgentEndpointUsageSince(tenantId, agentId, endpoint, since) {
    const result = await this._query(
      `select coalesce(sum(quantity), 0) as total
         from usage_records
        where tenant_id = $1
          and agent_id = $2
          and endpoint = $3
          and occurred_at >= $4`,
      [tenantId, agentId, endpoint, since.toISOString()],
    );
    return Number(result.rows[0].total);
  }

  async recordOverageCharge({ tenantId, agentId, endpoint, reasons, amountUsdc, requestId }) {
    return this._withTx(async (client) => {
      const now = new Date();
      const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
      const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);

      const currentInvoice = await this._query(
        `select id
           from invoices
          where tenant_id = $1
            and period_start = $2
          order by created_at desc
          limit 1`,
        [tenantId, periodStart],
        client,
      );

      let invoiceId = currentInvoice.rows[0]?.id;
      if (!invoiceId) {
        const invoiceResult = await this._query(
          `insert into invoices (tenant_id, period_start, period_end, amount_usdc, status)
           values ($1, $2, $3, 0, 'draft')
           returning id`,
          [tenantId, periodStart, periodEnd],
          client,
        );
        invoiceId = invoiceResult.rows[0]?.id;
      }

      await this._query(
        `update invoices
            set amount_usdc = amount_usdc + $2
          where id = $1`,
        [invoiceId, Number(amountUsdc || 0)],
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
          action: "billing.overage_charge",
          resourceType: "invoice",
          resourceId: invoiceId,
          requestId,
          metadata: {
            endpoint,
            reasons,
            amount_usdc: Number(amountUsdc || 0),
          },
        },
        client,
      );

      const updatedInvoice = await this._query(
        `select amount_usdc from invoices where id = $1`,
        [invoiceId],
        client,
      );

      return {
        invoiceId,
        amountUsdc: Number(updatedInvoice.rows[0].amount_usdc),
      };
    });
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
        qps: Number(row.qps || 120),
        mailbox_limit: Number(row.mailbox_limit || 100),
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
              l.expires_at as lease_expires_at,
              a.id as mailbox_account_id,
              a.backend_status as mailbox_account_backend_status,
              lv2.id as mailbox_lease_v2_id,
              lv2.lease_status as lease_v2_status
         from mailboxes m
         left join mailbox_leases l on l.mailbox_id = m.id and l.status = 'active'
         left join mailbox_accounts a on a.address = m.address
         left join mailbox_leases_v2 lv2
           on lv2.mailbox_account_id = a.id
          and lv2.lease_status in ('pending', 'active', 'releasing')
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
        mailbox_account_id: row.mailbox_account_id,
        mailbox_account_backend_status: row.mailbox_account_backend_status,
        mailbox_lease_v2_id: row.mailbox_lease_v2_id,
        lease_v2_status: row.lease_v2_status,
      })),
      page,
      pageSize,
    );
  }

  async listMailboxesForReconcile() {
    const result = await this._query(
      `select m.id as mailbox_id,
              m.tenant_id,
              m.address,
              m.status,
              m.provider_ref,
              l.agent_id,
              l.expires_at as lease_expires_at
         from mailboxes m
         left join mailbox_leases l on l.mailbox_id = m.id and l.status = 'active'
        order by m.address asc`,
    );
    return result.rows.map((row) => ({
      mailboxId: row.mailbox_id,
      tenantId: row.tenant_id,
      address: row.address,
      status: row.status,
      providerRef: row.provider_ref,
      agentId: row.agent_id,
      leaseExpiresAt: row.lease_expires_at ? row.lease_expires_at.toISOString() : null,
    }));
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
              ) then 'parsed'
              when exists (
                select 1 from message_events me where me.message_id = m.id and me.event_type = 'mail.parse_failed'
              ) then 'failed'
              else 'pending' end as parsed_status,
              exists (
                select 1 from message_events me where me.message_id = m.id and me.event_type = 'otp.extracted' and me.otp_code is not null
              ) as otp_extracted,
              coalesce(mv2.mailbox_account_id, a.id) as mailbox_account_id,
              mv2.mailbox_lease_id as mailbox_lease_v2_id,
              coalesce(
                mv2.message_status,
                case
                  when exists (
                    select 1 from message_events me where me.message_id = m.id and me.event_type = 'otp.extracted'
                  ) then 'parsed'
                  when exists (
                    select 1 from message_events me where me.message_id = m.id and me.event_type = 'mail.parse_failed'
                  ) then 'parse_failed'
                  else 'received'
                end
              ) as message_v2_status
         from messages m
         left join messages_v2 mv2 on mv2.id = m.id
         left join mailboxes mb on mb.id = m.mailbox_id
         left join mailbox_accounts a on a.address = mb.address
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
      mailbox_account_id: row.mailbox_account_id,
      mailbox_lease_v2_id: row.mailbox_lease_v2_id,
      message_v2_status: row.message_v2_status,
    }));
    if (parsedStatus) items = items.filter((item) => item.parsed_status === parsedStatus);
    return this._paginate(items, page, pageSize);
  }

  async adminListSendAttempts({ page, pageSize, tenantId, submissionStatus }) {
    const tables = await this._loadV2TableAvailability();
    if (!tables.send_attempts) {
      return this._paginate([], page, pageSize);
    }

    const values = [];
    const filters = [];
    if (tenantId) {
      values.push(tenantId);
      filters.push(`sa.tenant_id = $${values.length}`);
    }
    if (submissionStatus) {
      values.push(submissionStatus);
      filters.push(`sa.submission_status = $${values.length}`);
    }
    const where = filters.length ? `where ${filters.join(" and ")}` : "";
    const result = await this._query(
      `select sa.id as send_attempt_id,
              sa.tenant_id,
              sa.agent_id,
              m.id as mailbox_id,
              sa.mailbox_account_id,
              sa.from_address,
              jsonb_array_length(sa.to_json) as recipient_count,
              sa.subject,
              sa.submission_status,
              sa.backend_queue_id,
              sa.smtp_response,
              sa.submitted_at,
              sa.created_at,
              sa.updated_at
         from send_attempts sa
         left join mailbox_accounts a on a.id = sa.mailbox_account_id
         left join mailboxes m on m.address = a.address
         ${where}
        order by sa.created_at desc`,
      values,
    );
    return this._paginate(
      result.rows.map((row) => ({
        send_attempt_id: row.send_attempt_id,
        tenant_id: row.tenant_id,
        agent_id: row.agent_id,
        mailbox_id: row.mailbox_id,
        mailbox_account_id: row.mailbox_account_id,
        from_address: row.from_address,
        recipient_count: Number(row.recipient_count || 0),
        subject: row.subject,
        submission_status: row.submission_status,
        backend_queue_id: row.backend_queue_id,
        smtp_response: row.smtp_response,
        submitted_at: row.submitted_at ? row.submitted_at.toISOString() : null,
        created_at: row.created_at ? row.created_at.toISOString() : null,
        updated_at: row.updated_at ? row.updated_at.toISOString() : null,
      })),
      page,
      pageSize,
    );
  }

  async listTenantSendAttemptsV2({ tenantId, mailboxId = null, page, pageSize, submissionStatus = null }) {
    const tables = await this._loadV2TableAvailability();
    if (!tables.send_attempts) {
      return this._paginate([], page, pageSize);
    }
    const values = [tenantId];
    const filters = [`sa.tenant_id = $1`];
    if (mailboxId) {
      values.push(mailboxId);
      filters.push(`m.id = $${values.length}`);
    }
    if (submissionStatus) {
      values.push(submissionStatus);
      filters.push(`sa.submission_status = $${values.length}`);
    }
    const where = `where ${filters.join(" and ")}`;
    const result = await this._query(
      `select sa.id as send_attempt_id,
              m.id as mailbox_id,
              sa.mailbox_account_id,
              sa.agent_id,
              sa.from_address,
              jsonb_array_length(sa.to_json) as recipient_count,
              sa.subject,
              sa.submission_status,
              sa.backend_queue_id,
              sa.smtp_response,
              sa.submitted_at,
              sa.created_at,
              sa.updated_at
         from send_attempts sa
         left join mailbox_accounts a on a.id = sa.mailbox_account_id
         left join mailboxes m on m.address = a.address
         ${where}
        order by sa.created_at desc`,
      values,
    );
    return this._paginate(
      result.rows.map((row) => ({
        send_attempt_id: row.send_attempt_id,
        mailbox_id: row.mailbox_id,
        mailbox_account_id: row.mailbox_account_id,
        agent_id: row.agent_id,
        from_address: row.from_address,
        recipient_count: Number(row.recipient_count || 0),
        subject: row.subject,
        submission_status: row.submission_status,
        backend_queue_id: row.backend_queue_id,
        smtp_response: row.smtp_response,
        submitted_at: row.submitted_at ? row.submitted_at.toISOString() : null,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
      })),
      page,
      pageSize,
    );
  }

  async getTenantSendAttemptV2(tenantId, sendAttemptId) {
    const tables = await this._loadV2TableAvailability();
    if (!tables.send_attempts) return null;
    const result = await this._query(
      `select sa.id as send_attempt_id,
              m.id as mailbox_id,
              sa.mailbox_account_id,
              sa.agent_id,
              sa.from_address,
              sa.to_json,
              sa.subject,
              sa.submission_status,
              sa.backend_queue_id,
              sa.smtp_response,
              sa.submitted_at,
              sa.created_at,
              sa.updated_at
         from send_attempts sa
         left join mailbox_accounts a on a.id = sa.mailbox_account_id
         left join mailboxes m on m.address = a.address
        where sa.id = $1
          and sa.tenant_id = $2
        limit 1`,
      [sendAttemptId, tenantId],
    );
    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    return {
      send_attempt_id: row.send_attempt_id,
      mailbox_id: row.mailbox_id,
      mailbox_account_id: row.mailbox_account_id,
      agent_id: row.agent_id,
      from_address: row.from_address,
      recipients: row.to_json,
      subject: row.subject,
      submission_status: row.submission_status,
      backend_queue_id: row.backend_queue_id,
      smtp_response: row.smtp_response,
      submitted_at: row.submitted_at ? row.submitted_at.toISOString() : null,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
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

  async adminListWebhookDeliveries({ page, pageSize, tenantId = null, webhookId = null }) {
    const tables = await this._loadV2TableAvailability();
    const values = [];
    const filters = tables.webhook_deliveries
      ? []
      : [`al.action = 'webhook.deliver'`, `al.resource_type = 'webhook'`];
    if (tenantId) {
      values.push(tenantId);
      filters.push(tables.webhook_deliveries ? `w.tenant_id = $${values.length}` : `al.tenant_id = $${values.length}`);
    }
    if (webhookId) {
      values.push(webhookId);
      filters.push(tables.webhook_deliveries ? `wd.webhook_id = $${values.length}` : `al.resource_id = $${values.length}`);
    }
    const where = filters.length ? `where ${filters.join(" and ")}` : "";
    const result = await this._query(
      tables.webhook_deliveries
        ? `select wd.id as delivery_log_id,
                  w.tenant_id,
                  wd.webhook_id,
                  w.target_url,
                  wd.event_type,
                  wd.response_code as status_code,
                  wd.attempt_number as attempts,
                  wd.delivery_status = 'delivered' as ok,
                  null::text as delivery_id,
                  wd.error_message,
                  wd.response_excerpt,
                  wd.request_id,
                  wd.delivered_at
             from webhook_deliveries wd
             join webhooks w on w.id = wd.webhook_id
             ${where}
            order by wd.created_at desc`
        : `select al.id as delivery_log_id,
                  al.tenant_id,
                  al.resource_id as webhook_id,
                  w.target_url,
                  al.metadata->>'event_type' as event_type,
                  nullif(al.metadata->>'status_code', '')::int as status_code,
                  nullif(al.metadata->>'attempts', '')::int as attempts,
                  case
                    when al.metadata ? 'ok' then (al.metadata->>'ok')::boolean
                    else null
                  end as ok,
                  al.metadata->>'delivery_id' as delivery_id,
                  al.metadata->>'error_message' as error_message,
                  al.metadata->>'response_excerpt' as response_excerpt,
                  al.request_id,
                  al.created_at as delivered_at
             from audit_logs al
             left join webhooks w on w.id = al.resource_id
             ${where}
            order by al.created_at desc`,
      values,
    );
    return this._paginate(
      result.rows.map((row) => ({
        delivery_log_id: row.delivery_log_id,
        tenant_id: row.tenant_id,
        webhook_id: row.webhook_id,
        target_url: row.target_url,
        event_type: row.event_type,
        status_code: row.status_code,
        attempts: row.attempts,
        ok: row.ok,
        delivery_id: row.delivery_id,
        error_message: row.error_message,
        response_excerpt: row.response_excerpt,
        request_id: row.request_id,
        delivered_at: row.delivered_at ? row.delivered_at.toISOString() : null,
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
    await this._query(`update webhooks set secret_hash = $2, secret_enc = $3 where id = $1`, [
      webhookId,
      hashSecret(secret),
      encryptSecret(secret, this.webhookSecretEncryptionKey),
    ]);
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

  async listMessagesForReparse({ tenantId = null, messageId = null, limit = 100 } = {}) {
    const values = [];
    const filters = [];
    if (tenantId) {
      values.push(tenantId);
      filters.push(`mb.tenant_id = $${values.length}`);
    }
    if (messageId) {
      values.push(messageId);
      filters.push(`m.id = $${values.length}`);
    }
    const where = filters.length ? `where ${filters.join(" and ")}` : "";
    values.push(limit);

    const result = await this._query(
      `select m.id as message_id,
              mb.tenant_id,
              m.subject,
              m.received_at,
              received.payload as received_payload,
              parsed.event_type as parsed_event_type,
              parsed.otp_code as current_otp_code,
              parsed.verification_link as current_verification_link
         from messages m
         join mailboxes mb on mb.id = m.mailbox_id
         left join lateral (
           select me.payload
             from message_events me
            where me.message_id = m.id
              and me.event_type = 'mail.received'
            order by me.created_at desc
            limit 1
         ) received on true
         left join lateral (
           select me.event_type, me.otp_code, me.verification_link
             from message_events me
            where me.message_id = m.id
              and me.event_type in ('otp.extracted', 'mail.parse_failed')
            order by me.created_at desc
            limit 1
         ) parsed on true
         ${where}
        order by m.received_at desc
        limit $${values.length}`,
      values,
    );

    return result.rows.map((row) => {
      const payload = row.received_payload || {};
      return {
        messageId: row.message_id,
        tenantId: row.tenant_id,
        subject: row.subject,
        receivedAt: row.received_at.toISOString(),
        textExcerpt: payload.text_excerpt || "",
        htmlExcerpt: payload.html_excerpt || "",
        htmlBody: payload.html_body || "",
        currentEventType: row.parsed_event_type || null,
        currentOtpCode: row.current_otp_code || null,
        currentVerificationLink: row.current_verification_link || null,
      };
    });
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
