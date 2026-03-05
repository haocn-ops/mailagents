# Agent Mail Cloud (V1 Scaffold)

This repository implements a V1 API scaffold based on:
- `docs/development.md`
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

## Local Quick Start (Node)

```bash
npm start
```

Default URL: `http://localhost:3000`

Health endpoint: `GET /healthz`

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
- runs migrations
- runs seed data
- starts API with `postgres` backend

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
- `npm run db:seed` - Seed tenant/agent/mailboxes/invoice data
- `npm run siwe:verify` - Verify SIWE message + signature from CLI
- `npm run smoke` - Local API smoke test
- `npm run worker:dev` - Run Worker locally with Wrangler
- `npm run worker:deploy` - Deploy Worker

## Environment Variables

Core:
- `PORT` (default: `3000`)
- `JWT_SECRET`
- `BASE_CHAIN_ID` (default: `84532`)
- `STORAGE_BACKEND` (`memory` or `postgres`)
- `DATABASE_URL` (required for `postgres`)

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

## Notes

On-chain settlement, Redis queues, and full mail backend integrations are not implemented yet.
