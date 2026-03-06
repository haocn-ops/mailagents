# Mailu Cutover Checklist

Use this checklist when replacing `mailu-dev` with the real Mailu fork.

## 1. DNS and Network

- `api.mailagents.net` points to the control-plane runtime
- `inbox.mailagents.net` MX points to the Mailu fork ingress
- TLS certificates are valid for both API and Mailu endpoints
- Mailu internal endpoint is reachable from `mailagents`

## 2. Mailu Internal Contract

The Mailu fork must successfully call:

- `POST /internal/mailboxes/provision`
- `POST /internal/mailboxes/release`
- `POST /internal/inbound/events`
- `GET /internal/mailboxes/{address}`
- `GET /internal/messages/{message_id}`

## 3. Shared Secrets

- `INTERNAL_API_TOKEN` is identical on both sides
- `MAILU_API_TOKEN` is configured in `mailagents`
- `WEBHOOK_SECRET_ENCRYPTION_KEY` is set only on the control plane

## 4. Control-Plane Production Gate

Run:

```bash
npm run preflight:prod
```

Expected result:

- no errors
- warnings reviewed and accepted

## 5. Database

- PostgreSQL reachable from the API runtime
- `npm run db:upgrade` executed for existing databases
- existing webhook secrets rotated if `secret_enc` was introduced after initial rollout

## 6. Functional Cutover Test

1. Allocate a mailbox
2. Confirm Mailu creates or enables the mailbox
3. Send a real email to the allocated address
4. Confirm Mailu calls `/internal/inbound/events`
5. Confirm `/v1/messages/latest` returns the parsed OTP/link
6. Confirm subscribed webhook receiver sees signed delivery headers
7. Release the mailbox
8. Confirm Mailu disables or deletes the mailbox

## 7. Post-Cutover Monitoring

- webhook delivery success rate
- inbound parse success rate
- Mailu mailbox provision/release failures
- reconciliation drift count
- admin audit logs for `mailbox.backend_*` and `message.ingest`
