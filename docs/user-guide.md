# Agent Mail Cloud User Guide (V1)

This guide is for API customers and integration teams. It covers:
- setup and startup
- authentication and API call flow
- payment header usage (`mock` / `hmac`)
- common troubleshooting
- Node and Cloudflare Worker deployment options

## 1. Quick Start

### 1.1 Docker Compose (Recommended for full local stack)

```bash
cp .env.example .env
docker compose up --build -d
```

Check service status:

```bash
docker compose ps
```

Run the Mailu integration smoke:

```bash
npm run smoke:mailu
```

This uses the bundled `mailu-dev` simulator to validate mailbox provisioning and inbound mail parsing locally.

Health check:

```bash
curl -s http://localhost:3000/healthz
```

Expected response:

```json
{"status":"ok","service":"agent-mail-cloud"}
```

To customize allocated mailbox addresses, set:

```bash
export MAILBOX_DOMAIN=inbox.mailagents.net
```

This changes generated addresses from `*@pool.mailcloud.local` to `*@inbox.mailagents.net`.

### 1.2 Local Node.js Startup

```bash
npm install
npm start
```

### 1.3 Cloudflare Worker Startup (local)

```bash
npm install
npm run worker:dev
```

### 1.4 Admin Dashboard

After deployment, open:

`https://<your-worker>.workers.dev/admin`

For your current environment:

`https://mailagents-api.izhenghaocn.workers.dev/admin`

## 2. Minimal End-to-End API Flow (5 Steps)

The examples below use `mock` payment mode.

### Step 1: Request SIWE challenge

```bash
curl -s http://localhost:3000/v1/auth/siwe/challenge \
  -H 'content-type: application/json' \
  -d '{"wallet_address":"0xabc0000000000000000000000000000000000123"}'
```

### Step 2: Verify SIWE and get access token

```bash
curl -s http://localhost:3000/v1/auth/siwe/verify \
  -H 'content-type: application/json' \
  -d '{"message":"<challenge_message>","signature":"0xdev"}'
```

Store the response fields:
- `access_token`
- `agent_id`

### Step 3: Allocate mailbox

```bash
curl -s http://localhost:3000/v1/mailboxes/allocate \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <access_token>' \
  -H 'x-payment-proof: mock-proof' \
  -d '{"agent_id":"<agent_id>","purpose":"signup","ttl_hours":1}'
```

Store:
- `mailbox_id`

### Step 4: Fetch latest messages

```bash
curl -s "http://localhost:3000/v1/messages/latest?mailbox_id=<mailbox_id>&limit=20" \
  -H 'authorization: Bearer <access_token>' \
  -H 'x-payment-proof: mock-proof'
```

### Step 5: Release mailbox

```bash
curl -s http://localhost:3000/v1/mailboxes/release \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <access_token>' \
  -d '{"mailbox_id":"<mailbox_id>"}'
```

## 3. Payment Modes

### 3.1 `mock` mode

- Config: `PAYMENT_MODE=mock`
- Protected endpoints only require the `x-payment-proof` header to be present.

Example:

```http
x-payment-proof: mock-proof
```

### 3.2 `hmac` mode

- Config:
  - `PAYMENT_MODE=hmac`
  - `X402_HMAC_SECRET=<your-secret>`

Header format:

```http
x-payment-proof: t=<unix_sec>,v1=<hex_hmac_sha256>
```

Canonical signing payload:

```text
<METHOD>\n<PATH>\n<TIMESTAMP>
```

Example:

```text
POST\n/v1/mailboxes/allocate\n1710000000
```

## 4. SIWE Modes

### 4.1 `mock` mode (default)

- Config: `SIWE_MODE=mock`
- Recommended for local development and early integration.

### 4.2 `strict` mode (EIP-4361)

- Config:
  - `SIWE_MODE=strict`
  - `SIWE_DOMAIN`
  - `SIWE_URI`

Install dependencies first:

```bash
npm install
```

Optional local verification via CLI:

```bash
SIWE_MODE=strict \
SIWE_SIGNATURE='<0x...>' \
SIWE_MESSAGE='<EIP-4361 message>' \
npm run siwe:verify
```

## 5. Cloudflare Worker Deployment

1. Ensure `wrangler.toml` is present and updated.
2. Set required secrets:

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put X402_HMAC_SECRET
npx wrangler secret put DATABASE_URL
```

3. Deploy:

```bash
npm run worker:deploy
```

Notes:
- Use Hyperdrive connection string for `DATABASE_URL` when using Postgres from Workers.
- Run DB migration/seed outside Worker startup.
- The latest schema also persists admin data used by `/admin`: tenant quotas, webhook delivery status, risk policies, and risk events.
- If you already have an older database, apply the matching schema changes before switching `STORAGE_BACKEND=postgres`.
- `MAILBOX_DOMAIN` only controls generated mailbox addresses. Real inbound mail on that domain still requires DNS, MX, and a receiver/ingestion pipeline.

## 6. Common Commands

Using Makefile:

```bash
make up
make ps
make logs
make smoke
make down
```

Using npm scripts:

```bash
npm run db:migrate
npm run db:seed
npm run smoke
npm run worker:dev
npm run worker:deploy
```

## 7. Troubleshooting

### 7.1 `401 unauthorized`

Common causes:
- missing `Authorization` header
- expired token
- expired SIWE challenge (`SIWE_CHALLENGE_TTL_MS`)

Checks:
1. re-run challenge + verify
2. confirm header format is `Authorization: Bearer <token>`

### 7.2 `402 payment_required` or `invalid_payment_proof`

Common causes:
- missing `x-payment-proof`
- HMAC mismatch in `hmac` mode
- timestamp outside `X402_HMAC_SKEW_SEC`

Checks:
1. verify header format
2. verify method/path/timestamp exactly match the signed payload

### 7.3 `409 no_available_mailbox`

Cause:
- mailbox pool exhausted

Actions:
1. release active mailboxes
2. run seed to add more mailboxes

### 7.4 Docker issues

- `Cannot connect to the Docker daemon`
  - start Docker Desktop / daemon
- `permission denied ... docker.sock`
  - fix docker socket/user permissions

### 7.5 Worker deployment issues

- `wrangler` authentication failed
  - run `wrangler login`
- missing secret errors
  - add required secrets with `wrangler secret put ...`

## 8. Related Documents

- API contract: `docs/openapi.yaml`
- Database DDL: `docs/db/schema.sql`
- Architecture and scope: `docs/development.md`
