# Production Runbook

This runbook covers the control-plane production rollout for `mailagents`.

## 1. Scope

This repository is production-ready for the control plane only when all of the following are true:

- a real Mailu fork is deployed separately
- PostgreSQL is provisioned and reachable
- `api.mailagents.net` routes to the API runtime
- `inbox.mailagents.net` routes to the Mailu fork mail flow
- production env vars pass `npm run preflight:prod`

## 2. Required Secrets

- `JWT_SECRET`
- `ADMIN_API_TOKEN`
- `INTERNAL_API_TOKEN`
- `MAILU_API_TOKEN`
- `WEBHOOK_SECRET_ENCRYPTION_KEY`
- `X402_HMAC_SECRET`

## 3. Pre-Deploy

1. Copy `.env.production.example` to `.env.production`
2. Fill all secrets with non-default values
3. Run:

```bash
npm run preflight:prod
```

4. For existing databases:

```bash
npm run db:upgrade
```

5. If `db:upgrade` introduced `webhooks.secret_enc` on an existing database, rotate all existing webhook secrets after rollout.

## 4. Deploy

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Expected result:

- API starts only if production preflight passes
- `/healthz` returns `200`
- `/v1/admin/*` requires `ADMIN_API_TOKEN`

## 5. Post-Deploy Verification

1. Health

```bash
curl -fsS https://api.mailagents.net/healthz
```

2. Production config gate

Startup logs must not contain `Production preflight failed`.

3. Admin auth

- request without `ADMIN_API_TOKEN` must return `401`
- request with `ADMIN_API_TOKEN` must return `200`

4. Mail flow

- allocate a mailbox
- provision in Mailu fork
- deliver a real inbound message
- verify `messages/latest` returns parsed OTP/link

5. Webhook flow

- create a webhook
- verify downstream receives:
  - `x-agent-mail-delivery-id`
  - `x-agent-mail-attempt`
  - `x-agent-mail-timestamp`
  - `x-agent-mail-signature`

## 6. Rollback

1. Roll back application image/tag
2. Keep database upgrade changes in place if they are additive
3. Re-run health and admin auth checks
4. Re-run mailbox allocation and inbound parse smoke

## 7. Known External Dependencies

These are not solved inside this repository:

- Mailu fork implementation and deployment
- DNS and MX for `inbox.mailagents.net`
- SMTP/IMAP storage and backup
- TLS certificates and ingress
- monitoring, alerting, log shipping
