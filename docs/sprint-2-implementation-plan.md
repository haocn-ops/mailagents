# Mailagents V2 Sprint 2 Implementation Plan

## Goal

Sprint 2 moves the project from "V2 foundation exists" into "V2 paths become the primary implementation direction".

The sprint does not try to finish the entire V2 migration. It focuses on reducing dependence on V1 internals and making the current V2 surface more complete and more operationally reliable.

## Scope

In scope:
- strengthen `/v2` mailbox, message, send-attempt, and webhook flows
- introduce clearer V2 repository and read-model boundaries
- move parser flow into the worker model
- improve webhook delivery execution and persistence
- expand regression coverage for V2 and worker-separated execution

Out of scope:
- full UI rewrite
- full removal of V1 routes
- final schema cleanup that drops V1 tables
- complete production cutover to V2-only reads and writes

## Why This Sprint

Sprint 1 already delivered:
- V2 schema drafts and additive writes
- queue abstraction
- mailbox and send services
- worker entrypoint
- first V2 endpoints
- compatibility-preserving integration with V1 routes

The next bottleneck is structural:
- many V2 routes still reuse V1-oriented internals
- parser and webhook execution are not yet fully aligned with the new async model
- V2 data access is still spread across broad store logic instead of narrower repository/read-model seams

## Deliverables

1. Stronger `/v2` endpoint behavior for mailbox, message, send-attempt, and webhook flows
2. V2-oriented repository and read-model modules for mailbox, message, send-attempt, and webhook state
3. Async parser job flow integrated with worker execution
4. First-class webhook delivery persistence and improved retry handling
5. Expanded tests for Redis-backed queue mode, worker-separated execution, retry paths, and V2 endpoint coverage
6. Updated technical and API documentation where Sprint 2 behavior changes existing assumptions

## Work Breakdown

### Task 1: Harden `/v2` route behavior

Files:
- `src/v2/mailbox-routes.js`
- `src/v2/message-routes.js`
- `src/v2/webhook-routes.js`
- `src/v2/index.js`
- `docs/openapi-v2.yaml`
- `docs/openapi-admin-v2.yaml`

Work:
- reduce thin-wrapper behavior that only forwards into V1 request paths
- align response fields and status codes with V2 contract intent
- ensure list and detail endpoints read from V2-facing state consistently
- close obvious contract gaps in mailbox lease, message, send-attempt, and webhook APIs

Acceptance:
- V2 routes are not only compatibility aliases
- main V2 resources have stable list/detail behavior
- API docs match the implemented behavior

### Task 2: Split V2 repositories and read models

Files:
- `src/v2/tenant-repository.js`
- `src/v2/tenant-read-models.js`
- new repository modules as needed under `src/v2/` or `src/repositories/`
- `src/storage/postgres-store.js`
- `src/storage/memory-store.js`

Work:
- extract mailbox, message, send-attempt, and webhook data access behind narrower modules
- separate write-side state transitions from read-side projection logic where practical
- reduce pressure on monolithic store methods as V2 expands

Acceptance:
- new V2 code paths depend on narrower repository/read-model interfaces
- storage backends remain compatible, but the V2 surface no longer grows by adding broad store methods everywhere

### Task 3: Move parser flow into jobs

Files:
- `src/jobs/message-parse-job.js`
- `src/workers/job-worker.js`
- `src/webhook-dispatcher.js`
- `src/internal/index.js`
- related tests under `test/jobs/` and `test/`

Work:
- enqueue parsing after inbound message persistence
- make parse state transitions explicit and retry-safe
- keep message parse results auditable in V2 state
- ensure webhook dispatch consumes stable parsed state instead of ad hoc inline flow

Acceptance:
- inbound message parse is worker-driven
- parse failures and retries update state consistently
- message parse behavior is testable independently from route handling

### Task 4: Rework webhook delivery execution

Files:
- `src/jobs/webhook-delivery-job.js`
- `src/webhook-dispatcher.js`
- `src/v2/webhook-routes.js`
- `src/admin/index.js`
- related persistence files and tests

Work:
- persist delivery attempts as first-class records
- clarify retry, backoff, terminal failure, and inspection behavior
- expose tenant and admin reads from the persisted delivery store rather than derived audit views where possible

Acceptance:
- webhook delivery state survives process restarts
- retry and terminal failure behavior are observable and test-covered
- delivery history endpoints are backed by explicit persisted records

### Task 5: Expand verification coverage

Files:
- `test/fetch-app.test.js`
- `test/storage/memory-store-v2.test.js`
- new Postgres- and queue-focused tests as needed
- service and job tests across mailbox, send, parse, and webhook flows

Work:
- add V2 route coverage beyond happy paths
- verify Redis-backed queue mode and worker-separated execution
- cover retry/idempotency/error cases for parser and webhook jobs
- verify compatibility between memory and Postgres backends where behavior should match

Acceptance:
- V2 async workflows are covered end-to-end at the service/job level
- critical failure paths are regression-tested

## Suggested Sequence

1. Tighten `/v2` route contracts and identify remaining V1 passthrough behavior.
2. Introduce narrower V2 repository and read-model seams.
3. Move parser execution into a dedicated job flow.
4. Rework webhook delivery persistence and retry model.
5. Expand tests around worker-separated and Redis-backed execution.
6. Refresh docs and implementation notes.

## Priorities

### High

- `/v2` route hardening
- repository/read-model split
- parser workerization

### Medium

- webhook delivery persistence rewrite
- Redis and worker-separated regression coverage

### Lower

- additional admin response reshaping
- cleanup of compatibility code that is no longer needed after the main Sprint 2 moves land

## Risks

### Risk 1: V2 routes still depend too heavily on V1 assumptions

Mitigation:
- measure V1 passthrough usage route by route
- prefer moving logic behind V2 service and repository seams before adding more endpoints

### Risk 2: async parser and webhook changes introduce duplicate processing

Mitigation:
- keep idempotency keys and retry-safe writes
- explicitly test duplicate inbound events and duplicate delivery retries

### Risk 3: store split increases short-term complexity

Mitigation:
- split by domain boundary, not by abstraction for its own sake
- keep memory and Postgres behavior aligned through shared tests

## Definition of Done

Sprint 2 is done when:
- primary `/v2` mailbox, message, send-attempt, and webhook endpoints behave as first-class V2 APIs
- new V2 logic depends on narrower repository/read-model interfaces instead of expanding monolithic store access
- parser execution is worker-driven
- webhook delivery history is persisted and operationally inspectable
- Redis-backed and worker-separated flows have meaningful regression coverage
- V1 routes still work, but new feature growth is centered on V2
