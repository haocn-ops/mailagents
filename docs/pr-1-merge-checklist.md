# PR #1 Merge Checklist

This checklist is for [PR #1](https://github.com/haocn-ops/mailagents/pull/1):
`V2 foundation: runtime APIs, queue-backed flows, and delivery visibility`

## Before final approval

- Confirm the PR scope is still foundation work and has not accumulated unrelated follow-up changes.
- Confirm `docs/openapi-v2.yaml` still matches the implemented `/v2` endpoints in `src/fetch-app.js`.
- Confirm the branch still preserves V1 compatibility for:
  - `POST /v1/mailboxes/allocate`
  - `POST /v1/mailboxes/release`
  - `POST /v1/mailboxes/credentials/reset`
  - `POST /v1/messages/send`
  - `GET /v1/messages/latest`
- Confirm queue-backed behavior still works in default `memory` mode and optional `redis` mode.
- Confirm `/internal/inbound/events` now enqueues parse work rather than doing the full parse/webhook path synchronously in the request handler.

## Files to spot-check

- `src/fetch-app.js`
- `src/services/mailbox-service.js`
- `src/services/send-service.js`
- `src/jobs/queue.js`
- `src/jobs/message-parse-job.js`
- `src/jobs/webhook-delivery-job.js`
- `src/workers/job-worker.js`
- `src/storage/memory-store.js`
- `src/storage/postgres-store.js`
- `docs/openapi-v2.yaml`
- `docs/db-migration-v2.sql`
- `test/fetch-app.test.js`

## Required test pass

Run:

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

Expected result:
- `55/55` passing on `codex/v2-docs`

## Merge decision points

Approve only if all are true:

- V1 client behavior remains intact.
- First-wave `/v2` routes are coherent enough to publish as alpha.
- Documentation and implementation are still aligned.
- Follow-up work has been kept out of this PR where possible.

## Immediately after merge

1. Rebase `codex/v2-webhook-deliveries` onto updated `master`.
2. Re-run the regression suite on that branch.
3. Review [PR #2](https://github.com/haocn-ops/mailagents/pull/2) only after the rebase is clean.
