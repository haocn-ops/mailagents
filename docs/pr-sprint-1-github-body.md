# PR Title

V2 foundation: runtime APIs, queue-backed flows, and delivery visibility

# PR Body

## Summary

This PR moves `mailagents` from V1-only extension work into a real V2 migration path while keeping the existing V1 API working.

It is no longer only a design or scaffolding branch. It now includes:
- V2 technical and API docs in the main repo
- additive V2 schema draft
- service and job layers for mailbox and send flows
- worker entrypoint
- optional Redis-backed queue support
- V2 mirror writes for mailbox lifecycle, inbound messages, parse results, and send attempts
- admin read models extended with V2-linked state
- first implemented `/v2` mailbox, message, send-attempt, and webhook-delivery endpoints
- webhook retry backoff and richer delivery failure context

## Main changes

### Documentation

Added or updated:
- `docs/mailagents-v2-technical-design.md`
- `docs/openapi-v2.yaml`
- `docs/openapi-admin-v2.yaml`
- `docs/db-migration-v2.sql`
- `docs/sprint-1-implementation-plan.md`
- `docs/pr-sprint-1-v2-foundation.md`
- `docs/pr-sprint-1-github-body.md`
- `README.md`
- `docs/README.md`

### Service and job layer

Added:
- `src/services/mailbox-service.js`
- `src/services/send-service.js`
- `src/jobs/queue.js`
- `src/jobs/mailbox-provision-job.js`
- `src/jobs/mailbox-release-job.js`
- `src/jobs/mailbox-credentials-reset-job.js`
- `src/jobs/send-submit-job.js`
- `src/jobs/message-parse-job.js`
- `src/jobs/webhook-delivery-job.js`
- `src/workers/job-worker.js`

Integrated into existing V1 routes:
- `POST /v1/mailboxes/allocate`
- `POST /v1/mailboxes/release`
- `POST /v1/mailboxes/credentials/reset`
- `POST /v1/messages/send`
- `POST /internal/inbound/events`

### Queue runtime

Added support for:
- `memory` queue backend
- `redis` queue backend

Updated:
- `src/config.js`
- `.env.example`
- `package.json`
- `docker-compose.yml`
- `docker-compose.prod.yml`

### V2 mirror writes

Mailbox lifecycle mirrors into:
- `mailbox_accounts`
- `mailbox_leases_v2`

Inbound lifecycle mirrors into:
- `raw_messages`
- `messages_v2`
- `message_parse_results`

Outbound lifecycle mirrors into:
- `send_attempts`
- `send_attempt_events`

The implementation is additive and defensive:
- if V2 tables exist, write them
- if V2 tables do not exist yet, keep V1 behavior working

### Initial `/v2` endpoints now implemented

Mailbox:
- `GET /v2/mailboxes/accounts`
- `GET /v2/mailboxes/leases`
- `GET /v2/mailboxes/leases/{lease_id}`
- `POST /v2/mailboxes/leases`
- `POST /v2/mailboxes/leases/{lease_id}/release`

Messages:
- `GET /v2/messages`
- `GET /v2/messages/{message_id}`
- `POST /v2/messages/send`

Send attempts:
- `GET /v2/send-attempts`
- `GET /v2/send-attempts/{send_attempt_id}`

Webhook delivery visibility:
- `GET /v2/webhooks/deliveries`
- `GET /v1/admin/webhook-deliveries`

### Admin read models

Enhanced:
- `GET /v1/admin/mailboxes`
- `GET /v1/admin/messages`

Added:
- `GET /v1/admin/send-attempts`
- `GET /v1/admin/webhook-deliveries`

### Webhook reliability

Added:
- retry backoff via `WEBHOOK_RETRY_BACKOFF_MS`
- richer failed-delivery context:
  - `error_message`
  - `response_excerpt`
- delivery failure visibility through audit-derived history endpoints

## Compatibility

This PR keeps V1 behavior as the primary public contract.

Important compatibility rules:
- existing V1 routes remain in place
- V2 writes are additive and defensive
- Redis is optional
- V1 send still returns the existing synchronous response shape
- some V2 write paths currently reuse the existing V1-compatible service flow

Known limitations:
- `POST /v2/mailboxes/leases` currently reuses the existing mailbox allocation path under the hood
- `POST /v2/messages/send` currently reuses the existing send service and may complete inline when the queue backend runs in memory mode
- webhook delivery history is currently derived from `audit_logs`, not yet a first-class persisted delivery table

## What is not in this PR

- full repository-layer extraction
- full UI rewrite
- V1 route removal
- first-class persisted webhook delivery store
- full `/v2/webhooks`, `/v2/usage/summary`, and `/v2/billing/*` parity

## Validation

Test command run on this branch:

```bash
node --test \
  test/fetch-app.test.js \
  test/storage/memory-store-v2.test.js \
  test/services/mailbox-service.test.js \
  test/services/send-service.test.js \
  test/jobs/mailbox-provision-job.test.js \
  test/jobs/send-submit-job.test.js \
  test/jobs/mailbox-release-job.test.js \
  test/jobs/mailbox-credentials-reset-job.test.js \
  test/jobs/message-parse-job.test.js \
  test/jobs/webhook-delivery-job.test.js \
  test/webhook-dispatcher.test.js \
  test/preflight.test.js
```

Result:
- `55/55` passing

## Recommended review order

1. `docs/mailagents-v2-technical-design.md`
2. `docs/openapi-v2.yaml`
3. `src/services/mailbox-service.js`
4. `src/services/send-service.js`
5. `src/jobs/queue.js`
6. `src/jobs/message-parse-job.js`
7. `src/jobs/webhook-delivery-job.js`
8. `src/workers/job-worker.js`
9. `src/storage/memory-store.js`
10. `src/storage/postgres-store.js`
11. `src/fetch-app.js`
12. `test/fetch-app.test.js`

## Follow-up

Recommended next step after merging:
- move webhook delivery history from audit-derived views into a first-class persisted delivery store
