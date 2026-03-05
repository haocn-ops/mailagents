# Agent Mail Cloud User Guide (V1)

This guide is for API customers and integration teams. It covers:
- setup and startup
- authentication and API call flow
- payment header usage (`mock` / `hmac`)
- common troubleshooting

## 1. Quick Start

### 1.1 Docker Compose (Recommended)

```bash
cp .env.example .env
docker compose up --build -d
```

Check service status:

```bash
docker compose ps
```

Health check:

```bash
curl -s http://localhost:3000/healthz
```

Expected response:

```json
{"status":"ok","service":"agent-mail-cloud"}
```

### 1.2 Local Node.js Startup

```bash
npm install
npm start
```

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

## 5. Common Commands

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
```

## 6. Troubleshooting

### 6.1 `401 unauthorized`

Common causes:
- missing `Authorization` header
- expired token
- expired SIWE challenge (`SIWE_CHALLENGE_TTL_MS`)

Checks:
1. re-run challenge + verify
2. confirm header format is `Authorization: Bearer <token>`

### 6.2 `402 payment_required` or `invalid_payment_proof`

Common causes:
- missing `x-payment-proof`
- HMAC mismatch in `hmac` mode
- timestamp outside `X402_HMAC_SKEW_SEC`

Checks:
1. verify header format
2. verify method/path/timestamp exactly match the signed payload

### 6.3 `409 no_available_mailbox`

Cause:
- mailbox pool exhausted

Actions:
1. release active mailboxes
2. run seed to add more mailboxes

### 6.4 Docker issues

- `Cannot connect to the Docker daemon`
  - start Docker Desktop / daemon
- `permission denied ... docker.sock`
  - fix docker socket/user permissions

## 7. Related Documents

- API contract: `docs/openapi.yaml`
- Database DDL: `docs/db/schema.sql`
- Architecture and scope: `docs/development.md`
