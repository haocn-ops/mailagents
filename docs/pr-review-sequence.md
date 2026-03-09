# PR Review Sequence

## Recommended order

1. Review and merge [PR #1](https://github.com/haocn-ops/mailagents/pull/1) first.
2. Rebase [PR #2](https://github.com/haocn-ops/mailagents/pull/2) onto the updated `master` after `#1` lands.
3. Review and merge `#2` only after the rebase is clean.

## Why this order

`#1` is the foundation branch. It introduces:
- V2 runtime endpoints
- queue-backed mailbox/message flows
- worker-driven inbound parse and webhook delivery
- first V2 read models

`#2` depends conceptually on `#1` and narrows one follow-up area:
- webhook delivery history persistence
- migration from audit-derived history to first-class delivery storage

Merging `#2` first would make the dependency direction harder to reason about.

## Reviewer focus

### PR #1

Focus on:
- V1 compatibility risks
- V2 route semantics
- queue/job boundaries
- dual-write correctness
- admin/read model correctness

Suggested hotspots:
- `src/fetch-app.js`
- `src/services/*`
- `src/jobs/*`
- `src/storage/memory-store.js`
- `src/storage/postgres-store.js`
- `test/fetch-app.test.js`

### PR #2

Focus on:
- delivery persistence correctness
- fallback behavior when `webhook_deliveries` table does not exist
- consistency between memory and postgres storage
- whether audit-log fallback is still acceptable for rollout

Suggested hotspots:
- `src/storage/postgres-store.js`
- `src/storage/memory-store.js`
- `src/jobs/webhook-delivery-job.js`
- `docs/db-migration-v2.sql`
- `test/storage/memory-store-v2.test.js`

## Merge checklist

For `#1`:
- verify CI is green
- confirm docs and implemented `/v2` endpoints still match
- merge to `master`

For `#2`:
- rebase onto latest `master`
- rerun regression suite
- check that `webhook_deliveries` migration shape still matches the store writes
- merge only after confirming no drift from `#1`
