# Agent Mail Cloud (V1 Scaffold)

This repository implements a V1 API scaffold based on:
- `docs/development.md`
- `docs/openapi.yaml`
- `docs/db/schema.sql`

Start with the user documentation: `docs/user-guide.md`

Current capabilities:
- SIWE challenge/verify (`mock` and `strict` modes)
- JWT auth (HS256)
- Mailbox allocate/release
- Latest message fetch
- Webhook creation
- Usage summary and invoice query
- x402-style protection (`mock` and `hmac`)
- Switchable storage backend: `memory` (default) / `postgres`

## Quick Start

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

## PostgreSQL Mode

```bash
npm install
DATABASE_URL='postgres://user:pass@localhost:5432/mailcloud' npm run db:migrate
DATABASE_URL='postgres://user:pass@localhost:5432/mailcloud' npm run db:seed
STORAGE_BACKEND=postgres DATABASE_URL='postgres://user:pass@localhost:5432/mailcloud' npm start
```

## SIWE Strict Mode

```bash
npm install
SIWE_MODE=strict SIWE_DOMAIN=localhost SIWE_URI=http://localhost npm start
```

If `siwe` dependency is missing in strict mode, the API returns `500 siwe_unavailable`.

## Notes

On-chain settlement, Redis queues, and real mail backend integrations are not implemented yet.
