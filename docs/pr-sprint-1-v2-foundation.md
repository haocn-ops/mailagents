# Sprint 1 PR Summary: V2 Foundation

## Purpose

This PR started as the V2 foundation branch and now also includes the first implemented V2 runtime endpoints.

The branch does not deliver the full V2 architecture. It establishes the minimum foundation required to keep building:
- V2 design and API documents live in the main repo
- additive V2 schema draft
- service and job layer for mailbox and send flows
- worker entrypoint
- optional Redis-backed queue runtime
- V2 mirror writes for mailbox, inbound message, parse result, and send attempt data
- initial admin read model support for V2 state
- first `/v2` mailbox, message, and send-attempt endpoints
- webhook retry backoff and richer delivery failure context

## What Changed

### 1. V2 planning documents moved into the main repository

Added:
- `docs/mailagents-v2-technical-design.md`
- `docs/openapi-v2.yaml`
- `docs/openapi-admin-v2.yaml`
- `docs/db-migration-v2.sql`
- `docs/sprint-1-implementation-plan.md`

Updated:
- `README.md`
- `docs/README.md`

This keeps design and implementation in one place instead of maintaining a separate long-lived design repo.

### 2. Mailbox and send flows now have service and job layers

Added:
- `src/services/mailbox-service.js`
- `src/services/send-service.js`
- `src/jobs/queue.js`
- `src/jobs/mailbox-provision-job.js`
- `src/jobs/mailbox-release-job.js`
- `src/jobs/mailbox-credentials-reset-job.js`
- `src/jobs/send-submit-job.js`
- `src/workers/job-worker.js`

V1 routes now delegate to services instead of continuing to grow request-path logic inside `src/fetch-app.js`.

Affected V1 endpoints:
- `POST /v1/mailboxes/allocate`
- `POST /v1/mailboxes/release`
- `POST /v1/mailboxes/credentials/reset`
- `POST /v1/messages/send`

### 3. Queue runtime supports `memory` and `redis`

The queue abstraction can now run in:
- `memory` mode for tests and simple local execution
- `redis` mode for real producer/worker separation

Related changes:
- `src/config.js`
- `package.json`
- `.env.example`
- `docker-compose.yml`
- `docker-compose.prod.yml`

### 4. V2 mirror writes were added behind the current V1 flows

Mailbox lifecycle mirrors into:
- `mailbox_accounts`
- `mailbox_leases_v2`

Inbound message lifecycle mirrors into:
- `raw_messages`
- `messages_v2`
- `message_parse_results`

Outbound send lifecycle mirrors into:
- `send_attempts`
- `send_attempt_events`

The implementation is additive and defensive:
- if V2 tables exist, write them
- if V2 tables do not exist yet, keep V1 behavior working

### 5. Admin API can now see V2-linked state

Enhanced:
- `GET /v1/admin/mailboxes`
- `GET /v1/admin/messages`

Added:
- `GET /v1/admin/send-attempts`

New admin response fields include:
- `mailbox_account_id`
- `mailbox_lease_v2_id`
- `lease_v2_status`
- `message_v2_status`
- `submission_status`

### 6. Initial V2 endpoints are now implemented

Added:
- `GET /v2/mailboxes/accounts`
- `GET /v2/mailboxes/leases`
- `GET /v2/mailboxes/leases/{lease_id}`
- `POST /v2/mailboxes/leases`
- `POST /v2/mailboxes/leases/{lease_id}/release`
- `GET /v2/messages`
- `GET /v2/messages/{message_id}`
- `POST /v2/messages/send`
- `GET /v2/send-attempts`
- `GET /v2/send-attempts/{send_attempt_id}`

These endpoints currently read from the V2 mirror data that was introduced earlier in the branch.

### 7. Webhook delivery is more production-oriented

Updated:
- webhook dispatcher now supports retry backoff between attempts
- failed deliveries now return and record richer context, including response excerpts and error messages
- failure context is written into webhook delivery audit metadata for later inspection

## Compatibility Rules

This PR intentionally keeps V1 compatibility in place.

Current behavior:
- V1 routes still exist
- V1 response shapes are still the primary contract
- V2 writes are additive
- Redis is optional
- admin V2 state is exposed through extra fields, not a new breaking admin API

Known intentional limitations:
- `POST /v1/messages/send` still returns the existing V1 synchronous response shape even though it now records a V2 `send_attempt`
- `POST /v2/mailboxes/leases` currently reuses the existing mailbox allocation path under the hood
- `POST /v2/messages/send` still reuses the current send service and may complete inline when the queue backend runs in memory mode

## Not Included

This PR does not attempt to complete V2.

Still out of scope:
- full `/v2/*` route implementation
- full repository-layer split
- parser worker separation
- webhook delivery worker rewrite
- UI rewrite
- full read models backed only by V2 tables
- removal of V1 tables or V1 routes

## Verification

Primary regression run:

```bash
node --test \
  test/fetch-app.test.js \
  test/storage/memory-store-v2.test.js \
  test/services/mailbox-service.test.js \
  test/services/send-service.test.js \
  test/jobs/mailbox-provision-job.test.js \
  test/jobs/send-submit-job.test.js \
  test/jobs/mailbox-release-job.test.js \
  test/jobs/mailbox-credentials-reset-job.test.js
```

Expected result on this branch:
- `54/54` passing

## Reviewer Guide

Suggested review order:

1. `docs/mailagents-v2-technical-design.md`
2. `docs/sprint-1-implementation-plan.md`
3. `src/services/mailbox-service.js`
4. `src/services/send-service.js`
5. `src/jobs/queue.js`
6. `src/workers/job-worker.js`
7. `src/storage/memory-store.js`
8. `src/storage/postgres-store.js`
9. `src/fetch-app.js`
10. `test/fetch-app.test.js`

## Follow-up

Recommended next step after this PR:
- expose webhook delivery history more directly in admin and tenant APIs instead of relying mainly on audit logs
