# PR Title

V2 foundation: docs, queue-backed services, mirror writes, and admin read models

# PR Body

## Summary

This PR starts the V2 migration path inside the main `mailagents` repository while keeping the current V1 API working.

It does not attempt a full V2 rewrite. It establishes the minimum foundation needed to continue:
- V2 technical and API docs moved into the main repo
- additive V2 schema draft added
- mailbox and send flows routed through service and job layers
- worker entrypoint added
- optional Redis-backed queue support added
- V2 mirror writes added for mailbox lifecycle, inbound messages, parse results, and send attempts
- admin read models extended to expose V2-linked state

## Main changes

### Documentation

Added:
- `docs/mailagents-v2-technical-design.md`
- `docs/openapi-v2.yaml`
- `docs/openapi-admin-v2.yaml`
- `docs/db-migration-v2.sql`
- `docs/sprint-1-implementation-plan.md`
- `docs/pr-sprint-1-v2-foundation.md`

Updated:
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
- `src/workers/job-worker.js`

Integrated into existing V1 routes:
- `POST /v1/mailboxes/allocate`
- `POST /v1/mailboxes/release`
- `POST /v1/mailboxes/credentials/reset`
- `POST /v1/messages/send`

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

### Admin read models

Enhanced:
- `GET /v1/admin/mailboxes`
- `GET /v1/admin/messages`

Added:
- `GET /v1/admin/send-attempts`

## Compatibility

This PR keeps V1 behavior as the primary public contract.

Important compatibility rules:
- existing V1 routes remain in place
- V2 writes are additive and defensive
- Redis is optional
- V1 send still returns the existing synchronous response shape
- admin V2 visibility is exposed through extra fields, not a new breaking admin contract

## What is not in this PR

- full `/v2/*` route implementation
- parser worker split
- webhook delivery worker split
- full repository-layer extraction
- UI rewrite
- V1 removal

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
  test/jobs/mailbox-credentials-reset-job.test.js
```

Result:
- `44/44` passing

## Follow-up

Recommended next step after merging:
- start Sprint 2 by turning inbound parse and webhook delivery into explicit worker-driven flows and exposing the first `/v2/*` read endpoints
