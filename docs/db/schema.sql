create extension if not exists pgcrypto;

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tenant_quotas (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  qps int not null default 120,
  mailbox_limit int not null default 100,
  updated_at timestamptz not null default now()
);

create table wallet_identities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  chain_id int not null,
  address text not null,
  did text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique(chain_id, address),
  unique(did)
);

create table agents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table mailboxes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  address text not null unique,
  provider_ref text,
  type text not null default 'alias',
  status text not null default 'available',
  created_at timestamptz not null default now()
);

create table mailbox_leases (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references mailboxes(id),
  tenant_id uuid not null references tenants(id),
  agent_id uuid not null references agents(id),
  purpose text not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz,
  status text not null default 'active'
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references mailboxes(id),
  provider_message_id text,
  sender text,
  sender_domain text,
  subject text,
  raw_ref text,
  received_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table message_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id),
  event_type text not null,
  otp_code text,
  verification_link text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  target_url text not null,
  secret_hash text not null,
  event_types text[] not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  last_delivery_at timestamptz,
  last_status_code int
);

create table usage_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  agent_id uuid references agents(id),
  endpoint text not null,
  unit text not null,
  quantity numeric(20,6) not null,
  occurred_at timestamptz not null default now(),
  request_id text
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  period_start date not null,
  period_end date not null,
  amount_usdc numeric(20,6) not null,
  status text not null default 'draft',
  statement_hash text,
  settlement_tx_hash text,
  created_at timestamptz not null default now(),
  issued_at timestamptz
);

create table payment_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  invoice_id uuid references invoices(id),
  network text not null default 'base',
  token_symbol text not null default 'USDC',
  amount numeric(20,6) not null,
  payer_address text not null,
  tx_hash text not null,
  confirmed_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  unique(tx_hash)
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  agent_id uuid references agents(id),
  actor_did text,
  action text not null,
  resource_type text not null,
  resource_id text not null,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table risk_policies (
  id uuid primary key default gen_random_uuid(),
  policy_type text not null,
  value text not null,
  action text not null,
  created_by_did text,
  updated_at timestamptz not null default now(),
  unique(policy_type, value)
);

create table risk_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  severity text not null,
  type text not null,
  detail text not null,
  occurred_at timestamptz not null default now()
);

create index idx_mailbox_leases_active on mailbox_leases(mailbox_id, status, expires_at);
create index idx_messages_mailbox_received on messages(mailbox_id, received_at desc);
create index idx_message_events_message on message_events(message_id, event_type);
create index idx_usage_tenant_time on usage_records(tenant_id, occurred_at);
create index idx_audit_tenant_time on audit_logs(tenant_id, created_at desc);
create index idx_risk_events_tenant_time on risk_events(tenant_id, occurred_at desc);
