# Single-Host Deployment

This document is the recommended deployment path when you want the entire production stack in one place.

## 1. Target Layout

One Linux VPS or cloud host runs:

- `mailagents` control plane
- PostgreSQL
- Mailu fork
- reverse proxy / TLS termination

Recommended baseline:

- 4 vCPU
- 8 GB RAM
- 100+ GB SSD

Do not start with a smaller machine if you expect real inbound traffic and mail storage growth.

## 2. Public Endpoints

- `https://api.mailagents.net`
  - `mailagents` API
  - Admin Dashboard

- `inbox.mailagents.net`
  - mailbox domain handled by Mailu fork

## 3. Required Components

On the host, run:

1. reverse proxy
2. `mailagents`
3. PostgreSQL
4. Mailu fork

The reverse proxy must route:

- `api.mailagents.net` -> `mailagents`
- Mail protocols for `inbox.mailagents.net` -> Mailu fork

## 4. Recommended Docker Layout

Use two compose projects:

1. `mailagents`
2. Mailu fork

Keep them separate so:

- app deploys do not restart mail services
- mail service maintenance does not restart the control plane
- rollback is simpler

## 5. Deployment Order

1. provision VPS
2. install Docker + Docker Compose
3. configure DNS:
   - `api.mailagents.net`
   - `inbox.mailagents.net`
   - MX records for `inbox.mailagents.net`
4. deploy PostgreSQL
5. deploy Mailu fork
6. deploy `mailagents`
7. run DB upgrade if needed
8. run production verify
9. run Mailu cutover checklist

## 6. `mailagents` Host-Side Steps

```bash
git clone https://github.com/haocn-ops/mailagents.git
cd mailagents
cp .env.production.example .env.production
```

Fill production values, then run:

```bash
npm run preflight:prod
docker compose -f docker-compose.prod.yml up --build -d
```

## 7. Mailu Fork Requirements

The Mailu fork must be configured to:

- manage mailboxes under `inbox.mailagents.net`
- reach `https://api.mailagents.net/internal/*`
- authenticate with `INTERNAL_API_TOKEN`

## 8. Acceptance Criteria

The deployment is acceptable only if all are true:

- `https://api.mailagents.net/healthz` returns `200`
- `/v1/admin/*` rejects requests without `ADMIN_API_TOKEN`
- mailbox allocation succeeds
- Mailu provision callback succeeds
- real inbound mail reaches `/internal/inbound/events`
- `messages/latest` returns parsed OTP/link
- webhook deliveries include signed headers

## 9. Failure Domains

Single-host deployment is operationally simple, but it has one obvious tradeoff:

- one host failure can impact API, DB, and mail services together

That is acceptable for an initial production rollout, but not for higher availability targets.
