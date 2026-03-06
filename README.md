# Agent Mail Cloud (V1 Scaffold)

This repository implements a V1 API scaffold based on:
- `docs/development.md`
- `docs/mailu-fork-architecture.md`
- `docs/openapi.yaml`
- `docs/db/schema.sql`

Start with the customer-facing guide: `docs/user-guide.md`.

Current capabilities:
- SIWE challenge/verify (`mock` and `strict` modes)
- JWT auth (HS256)
- Mailbox allocate/release
- Latest message fetch
- Webhook creation
- Usage summary and invoice query
- x402-style protection (`mock` and `hmac`)
- Switchable storage backend: `memory` (default) / `postgres`
- Dual runtime support: Node server + Cloudflare Worker entry
- Live Admin Dashboard backed by `/v1/admin/*`
- Postgres-backed admin persistence for tenant quotas, webhook delivery state, risk policies, and risk events
- Configurable mailbox domain via `MAILBOX_DOMAIN`
- Mail backend adapter layer with `noop` and `mailu` backends
- Local `mailu-dev` simulator for Mailu fork integration development

## Local Quick Start (Node)

```bash
npm start
```

Default URL: `http://localhost:3000`

Health endpoint: `GET /healthz`
Admin dashboard URL (same deployment): `/admin`

## Docker Compose (One-Command Setup)

1. Create env file:

```bash
cp .env.example .env
```

2. Start services:

```bash
docker compose up --build
```

3. API URL:

`http://localhost:3000`

Compose automatically:
- starts PostgreSQL
- starts `mailu-dev` simulator
- runs migrations
- runs seed data
- starts API with `postgres` backend and `MAIL_PROVIDER=mailu`
- provisions the admin persistence schema used by the dashboard

After `docker compose up --build`, run:

```bash
npm run smoke:mailu
```

This validates:
- mailbox allocation through the mail backend adapter
- mailbox provisioning in `mailu-dev`
- inbound relay from `mailu-dev` into `/internal/inbound/events`
- OTP/link extraction through `messages/latest`

## Production Deploy

```bash
cp .env.production.example .env.production
npm run preflight:prod
docker compose -f docker-compose.prod.yml up --build -d
```

Production rollout details live in `docs/production-runbook.md`.
If you want everything in one place, use `docs/single-host-deployment.md`.
Cloudflare DNS and MX details live in `docs/cloudflare-dns-setup.md`.

## Cloudflare Workers Deployment

### 1. Install dependencies

```bash
npm install
```

### 2. Configure `wrangler.toml`

The repository already includes `wrangler.toml` with:
- `main = "src/worker.js"`
- `compatibility_flags = ["nodejs_compat"]`

Update `vars` values as needed.

### 3. Set secrets

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put X402_HMAC_SECRET
npx wrangler secret put DATABASE_URL
```

### 4. Run locally

```bash
npm run worker:dev
```

### 5. Deploy

```bash
npm run worker:deploy
```

Note:
- If using Postgres in Worker runtime, configure `DATABASE_URL` via Hyperdrive connection string.
- For first migration/seed, run them from CI or trusted backend job, not from Worker cold start.
- `docs/db/schema.sql` is a bootstrap schema; upgrading an existing database requires applying equivalent ALTER/CREATE statements before switching Worker runtime to `postgres`.

## Makefile

```bash
make help
```

Common targets:
- `make up` / `make down`
- `make logs`
- `make ps`
- `make migrate`
- `make seed`
- `make smoke`

## Test

```bash
npm test
```

## npm Scripts

- `npm run db:migrate` - Apply `docs/db/schema.sql`
- `npm run db:bootstrap` - Apply schema only when the database is empty
- `npm run db:upgrade` - Apply additive schema upgrades for existing databases
- `npm run db:seed` - Seed tenant/agent/mailboxes/invoice data
- `npm run reconcile:mailboxes` - Compare control-plane mailbox state with backend mailbox state (`-- --repair` to apply safe repairs)
- `npm run siwe:verify` - Verify SIWE message + signature from CLI
- `npm run preflight:prod` - Validate production readiness of current env vars
- `npm run verify:prod` - Basic post-deploy production verification
- `npm run verify:dns -- mailagents.net 149.28.123.3` - Validate API and mailbox DNS records
- `npm run smoke` - Local API smoke test
- `npm run mailu-dev` - Run the local Mailu dev simulator
- `npm run smoke:mailu` - Local API + `mailu-dev` integration smoke test
- `npm run worker:dev` - Run Worker locally with Wrangler
- `npm run worker:deploy` - Deploy Worker

## Environment Variables

Core:
- `PORT` (default: `3000`)
- `JWT_SECRET`
- `ADMIN_API_TOKEN`
- `BASE_CHAIN_ID` (default: `84532`)
- `MAILBOX_DOMAIN` (default: `inbox.mailagents.net` in current deployment)
- `MAIL_PROVIDER` (`noop` or `mailu`)
- `STORAGE_BACKEND` (`memory` or `postgres`)
- `DATABASE_URL` (required for `postgres`)
- `MAILU_BASE_URL`
- `MAILU_API_TOKEN`
- `MAILU_RELEASE_MODE`
- `MAILU_QUOTA_BYTES`
- `MAILU_AUTH_SCHEME`
- `INTERNAL_API_TOKEN`
- `WEBHOOK_SECRET_ENCRYPTION_KEY`
- `WEBHOOK_TIMEOUT_MS`
- `WEBHOOK_RETRY_ATTEMPTS`

SIWE:
- `SIWE_MODE` (`mock` default, or `strict`)
- `SIWE_DOMAIN` (default: `localhost`)
- `SIWE_URI` (default: `http://localhost`)
- `SIWE_STATEMENT`
- `SIWE_CHALLENGE_TTL_MS` (default: `300000`)

x402:
- `PAYMENT_MODE` (`mock` or `hmac`)
- `X402_HMAC_SECRET`
- `X402_HMAC_SKEW_SEC` (default: `300`)

Seed:
- `SEED_WALLET_ADDRESS`
- `SEED_TENANT_NAME`
- `SEED_AGENT_NAME`
- `SEED_MAILBOX_COUNT`

SIWE verify CLI:
- `SIWE_MESSAGE` or stdin
- `SIWE_SIGNATURE`
- optional: `SIWE_ADDRESS`, `SIWE_NONCE`

## Production Notes

- Set `ADMIN_API_TOKEN` to protect `/v1/admin/*` with a dedicated admin credential.
- Run `npm run preflight:prod` before production deployment.
- For existing databases, run `npm run db:upgrade` before switching application code.
- After `db:upgrade`, rotate existing webhook secrets so `secret_enc` is populated and outbound webhook signing is enabled.
- In production, use:
  - `SIWE_MODE=strict`
  - `PAYMENT_MODE=hmac`
  - `MAIL_PROVIDER=mailu`
  - `STORAGE_BACKEND=postgres`

## Notes

On-chain settlement, Redis queues, and full mail backend integrations are not implemented yet.
Setting `MAILBOX_DOMAIN` changes allocated mailbox addresses to your chosen domain. The current recommended pattern is `api.mailagents.net` for API traffic and `inbox.mailagents.net` for mailbox addresses. Real inbound email still requires DNS, MX, and a mail ingestion backend.
Mailu fork architecture notes live in `docs/mailu-fork-architecture.md`.
Current transitional adapter notes live in `docs/mailu-integration.md`.
Internal Mailu-to-control-plane contract lives in `docs/mailu-internal-api.md`.
Mailbox reconciliation notes live in `docs/mailbox-reconciliation.md`.
Production rollout notes live in `docs/production-runbook.md`.
Real Mailu cutover notes live in `docs/mailu-cutover-checklist.md`.
Cloudflare DNS setup notes live in `docs/cloudflare-dns-setup.md`.
`mailu-dev` is a local development simulator only; it is not the final Mailu fork implementation.
