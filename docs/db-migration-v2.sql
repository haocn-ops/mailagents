-- Mailagents V2 additive schema migration
-- This migration is designed to be additive against the current V1 schema.

create extension if not exists pgcrypto;

create table if not exists mailbox_accounts (
  id uuid primary key default gen_random_uuid(),
  address text not null unique,
  domain text not null,
  backend_ref text,
  backend_status text not null default 'provisioning',
  mailbox_type text not null default 'pooled',
  last_password_reset_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mailbox_leases_v2 (
  id uuid primary key default gen_random_uuid(),
  mailbox_account_id uuid not null references mailbox_accounts(id),
  tenant_id uuid not null references tenants(id),
  agent_id uuid not null references agents(id),
  lease_status text not null default 'pending',
  purpose text not null,
  started_at timestamptz,
  ends_at timestamptz not null,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_mailbox_leases_v2_one_active
on mailbox_leases_v2(mailbox_account_id)
where lease_status in ('pending', 'active', 'releasing');

create table if not exists raw_messages (
  id uuid primary key default gen_random_uuid(),
  mailbox_account_id uuid not null references mailbox_accounts(id),
  backend_message_id text,
  raw_ref text,
  headers_json jsonb not null default '{}'::jsonb,
  sender text,
  sender_domain text,
  subject text,
  received_at timestamptz not null,
  ingested_at timestamptz not null default now()
);

create unique index if not exists idx_raw_messages_backend_unique
on raw_messages(mailbox_account_id, backend_message_id)
where backend_message_id is not null;

create table if not exists messages_v2 (
  id uuid primary key default gen_random_uuid(),
  raw_message_id uuid not null references raw_messages(id),
  tenant_id uuid not null references tenants(id),
  agent_id uuid references agents(id),
  mailbox_account_id uuid not null references mailbox_accounts(id),
  mailbox_lease_id uuid references mailbox_leases_v2(id),
  from_address text,
  subject text,
  received_at timestamptz not null,
  message_status text not null default 'received',
  created_at timestamptz not null default now()
);

create table if not exists message_parse_results (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages_v2(id),
  parser_version text not null,
  parse_status text not null,
  otp_code text,
  verification_link text,
  text_excerpt text,
  confidence numeric(5,4),
  error_code text,
  created_at timestamptz not null default now()
);

create table if not exists send_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  agent_id uuid references agents(id),
  mailbox_account_id uuid not null references mailbox_accounts(id),
  mailbox_lease_id uuid references mailbox_leases_v2(id),
  from_address text not null,
  to_json jsonb not null,
  cc_json jsonb,
  bcc_json jsonb,
  subject text not null,
  text_body_ref text,
  html_body_ref text,
  submission_status text not null default 'queued',
  backend_queue_id text,
  smtp_response text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists send_attempt_events (
  id uuid primary key default gen_random_uuid(),
  send_attempt_id uuid not null references send_attempts(id),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references webhooks(id),
  event_type text not null,
  resource_id text not null,
  attempt_number int not null default 1,
  delivery_status text not null,
  response_code int,
  response_excerpt text,
  error_message text,
  request_id text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
