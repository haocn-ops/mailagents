# Sprint 1 PR Summary: V2 Foundation

## Purpose

This PR moves `mailagents` from V1-only extension work into a V2 migration path without breaking the existing V1 API.

The branch does not deliver the full V2 architecture. It establishes the minimum foundation required to keep building:
- V2 design and API documents live in the main repo
- additive V2 schema draft
- service and job layer for mailbox and send flows
- worker entrypoint
- optional Redis-backed queue runtime
- V2 mirror writes for mailbox, inbound message, parse result, and send attempt data
- initial admin read model support for V2 state

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

## Compatibility Rules

This PR intentionally keeps V1 compatibility in place.

Current behavior:
- V1 routes still exist
- V1 response shapes are still the primary contract
- V2 writes are additive
- Redis is optional
- admin V2 state is exposed through extra fields, not a new breaking admin API

Known intentional limitation:
- `POST /v1/messages/send` still returns the existing V1 synchronous response shape even though it now records a V2 `send_attempt`

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
- `44/44` passing

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
- start Sprint 2 by splitting inbound parse and webhook delivery into explicit worker-driven flows and exposing the first `/v2/*` read endpoints
