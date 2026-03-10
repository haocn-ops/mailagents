# Single-Host V2 Upgrade Plan

This document describes how to upgrade a single-host V1 deployment to the V2-capable control plane without breaking V1 traffic.

It assumes the deployment already follows `docs/single-host-deployment.md`.

## 1. Scope

This plan upgrades the server to:

- the V2-capable control plane code
- additive V2 database tables
- optional Redis-backed worker separation

It does not remove V1 routes. V1 stays enabled for compatibility.

## 2. Prerequisites

- Docker and Docker Compose installed on the host.
- Existing `mailagents` single-host deployment is healthy.
- A backup or snapshot exists for the PostgreSQL volume.

If using Redis for queues:

- Redis is reachable from the control plane and worker processes.
- `QUEUE_BACKEND=redis` and `QUEUE_REDIS_URL` are set.
- `QUEUE_PREFIX`, `QUEUE_JOB_ATTEMPTS`, and `QUEUE_JOB_BACKOFF_MS` are reviewed.

Suggested queue defaults:

- `QUEUE_BACKEND=redis`
- `QUEUE_REDIS_URL=redis://redis:6379`
- `QUEUE_PREFIX=mailagents`
- `QUEUE_JOB_ATTEMPTS=3`
- `QUEUE_JOB_BACKOFF_MS=1000`

## 3. Deployment Plan

### Step 1: Preflight

On the host:

```bash
cd mailagents
npm run preflight:prod
```

### Step 2: Additive DB Migration

For existing databases:

```bash
npm run db:upgrade
```

This runs the additive migration in `docs/db-migration-v2.sql`.

### Step 3: Deploy New Control Plane

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

### Step 4: Start Worker (Optional but Recommended)

If Redis is configured, run the worker process on the same host:

```bash
npm run worker:start
```

### Step 5: Verify

Minimum checks:

- `GET /healthz` returns `200`
- V1 mailbox allocation still succeeds
- V2 `GET /v2/messages` and `POST /v2/messages/send` return `200/202`
- Webhook delivery history is visible in `/v2/webhooks/deliveries`
- Admin endpoints still require `ADMIN_API_TOKEN`
- If `webhooks.secret_enc` was introduced, rotate one existing webhook secret via `POST /v1/admin/webhooks/{webhook_id}/rotate-secret` and confirm signed delivery headers

For mail cutover, follow `docs/mailu-cutover-checklist.md`.

### Step 6: Webhook Secret Rotation

If `db:upgrade` introduced `webhooks.secret_enc` on an existing database, rotate all existing webhook secrets after deployment.

## 4. Rollback

1. Roll back the application image/tag.
2. Keep additive DB migration changes in place.
3. Re-run health and admin auth checks.
4. Re-run mailbox allocation and inbound parse smoke tests.

## 5. References

- `docs/single-host-deployment.md`
- `docs/production-runbook.md`
- `docs/mailu-cutover-checklist.md`
- `docs/db-migration-v2.sql`
