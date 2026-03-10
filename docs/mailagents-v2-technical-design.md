# Mailagents V2 Technical Design

## 1. Overview

This document defines a practical V2 design for the `haocn-ops/mailagents` project.

The V2 goal is not to add more isolated features. The goal is to turn the current V1 system into a service with clear boundaries, async reliability, and production-grade operability.

The design is based on review of the current repository:
- `README.md`
- `docs/development.md`
- `docs/openapi.yaml`
- `docs/openapi-admin.yaml`
- `docs/db/schema.sql`
- `docs/project-retrospective.md`
- `docs/current-production-state.md`
- `docs/redesign-architecture.md`
- `docs/redesign-schema.md`

## 2. Current System Summary

The current project is already more than a mailbox prototype. It is a control plane for programmable agent mailboxes with these working capabilities:
- SIWE authentication
- tenant and agent isolation
- mailbox allocation and release
- inbound message fetch
- OTP and verification link extraction
- webhook registration
- usage and invoice queries
- admin dashboard
- Mailu-backed real inbound and outbound mail

The main architectural issue in V1 is that too many concerns are mixed together:
- public API
- admin API
- internal API
- HTML UI rendering
- business rules
- storage access
- mail backend orchestration

In the current codebase this is most visible in `src/fetch-app.js`.

## 3. V2 Goals

V2 must preserve the existing product capabilities while fixing the main architectural problems.

Must keep:
- SIWE login
- tenant and agent model
- mailbox lifecycle
- inbound parsing
- webhook delivery
- billing visibility
- admin visibility
- real Mailu integration

Must improve:
- explicit service boundaries
- async job execution
- mailbox domain model
- message domain model
- outbound send lifecycle
- operational recovery
- observability

## 4. System Boundaries

V2 separates the system into four logical services.

### 4.1 Control Plane API

Owns:
- public API
- admin API
- internal API ingress
- auth and session issuance
- entitlement decisions
- billing read models
- operator-facing read models

Does not own:
- direct Maildir traversal
- SMTP protocol logic
- parser execution
- long-running mailbox jobs

### 4.2 Job Worker

Owns:
- mailbox provision and release
- credential reset
- outbound send submission
- webhook delivery
- reconciliation repair

### 4.3 Mail Sync Worker

Owns:
- inbound message discovery from Mailu or Maildir
- dedupe
- raw message persistence
- enqueueing parse jobs

### 4.4 Parser Worker

Owns:
- text extraction
- HTML normalization
- OTP extraction
- verification link extraction
- parser versioning
- historical reparse

Mailu remains the mail data plane. It is not the business API.

## 5. Deployment Topology

The preferred V2 deployment path is single-region Docker deployment with Redis added to the current production stack.

Components:
- `nginx`
- `control-plane-api`
- `job-worker`
- `mail-sync-worker`
- `parser-worker`
- `postgres`
- `redis`
- `mailu`

Cloudflare Worker should not shape the primary V2 architecture.

## 6. Repository Structure

The current `src/` layout should be evolved into the following structure:

```text
src/
  http/
    public/
    admin/
    internal/
  services/
  repositories/
    postgres/
    memory/
  jobs/
  workers/
  read-models/
  ui/
```

Migration rule:
- do not keep adding business logic to `src/fetch-app.js`
- do not keep expanding monolithic store objects
- move new work into services, repositories, and jobs first

## 7. Domain Model

### 7.1 Mailbox Account

A real backend mailbox resource.

Fields:
- `id`
- `address`
- `domain`
- `backend_ref`
- `backend_status`
- `mailbox_type`
- `last_password_reset_at`
- `created_at`
- `updated_at`

Suggested states:
- `provisioning`
- `active`
- `disabled`
- `error`

### 7.2 Mailbox Lease

A product assignment of a mailbox account to a tenant and agent.

Fields:
- `id`
- `mailbox_account_id`
- `tenant_id`
- `agent_id`
- `lease_status`
- `purpose`
- `started_at`
- `ends_at`
- `released_at`
- `created_at`
- `updated_at`

Suggested states:
- `pending`
- `active`
- `releasing`
- `released`
- `expired`
- `frozen`

Constraint:
- at most one active or pending lease per mailbox account

### 7.3 Raw Message

A durable source reference for inbound message reparsing.

### 7.4 Message

A user-facing normalized message record.

### 7.5 Message Parse Result

A versioned parser output.

### 7.6 Send Attempt

A first-class outbound send lifecycle record.

### 7.7 Webhook Delivery

A delivery record separate from webhook definition state.

## 8. Database Migration Plan

V2 should not replace the V1 schema in one step. It should add new tables and migrate gradually.

Suggested first-wave tables:
- `mailbox_accounts`
- `mailbox_leases_v2`
- `raw_messages`
- `messages_v2`
- `message_parse_results`
- `send_attempts`
- `send_attempt_events`
- `webhook_deliveries`

## 9. API Design

Suggested public API surface:
- `POST /v2/auth/siwe/challenge`
- `POST /v2/auth/siwe/verify`
- `POST /v2/mailboxes/leases`
- `POST /v2/mailboxes/leases/{lease_id}/release`
- `GET /v2/mailboxes/accounts`
- `POST /v2/mailboxes/accounts/{account_id}/credentials/reset`
- `GET /v2/messages`
- `GET /v2/messages/{message_id}`
- `POST /v2/messages/send`
- `GET /v2/send-attempts`
- `GET /v2/send-attempts/{send_attempt_id}`
- `POST /v2/webhooks`
- `GET /v2/webhooks`
- `POST /v2/webhooks/{webhook_id}/rotate-secret`
- `GET /v2/usage/summary`
- `GET /v2/billing/invoices`
- `GET /v2/billing/invoices/{invoice_id}`

Important semantic changes:
- mailbox allocate becomes lease request
- send returns `send_attempt_id`
- messages move from latest-only to list and detail endpoints

## 10. Service Design

### 10.1 Mailbox Service

Responsibilities:
- validate tenant and agent ownership
- apply policy and TTL rules
- create mailbox leases
- enqueue provision and release jobs
- reset mailbox credentials

### 10.2 Message Service

Responsibilities:
- list and fetch messages through read models
- ingest inbound message references
- create message records
- enqueue parse jobs

### 10.3 Send Service

Responsibilities:
- validate mailbox ownership
- create send attempt records
- enqueue send jobs
- expose send status views

### 10.4 Entitlement Service

Responsibilities:
- evaluate free limits
- decide whether a request is allowed
- hide low-level payment proof details from product-facing flows
- enforce cold-start cooldowns (e.g., unbound tenants limited to 10 sends in their first 24 hours)

## 11. Job Design

Redis becomes mandatory for V2 because async work is a core part of the design.

Suggested job types:
- `mailbox.provision`
- `mailbox.release`
- `message.parse`
- `send.submit`
- `webhook.deliver`

## 12. Key Workflows

### 12.1 Mailbox Lease Request

1. API validates auth and entitlement.
2. Service creates lease in `pending`.
3. Service enqueues `mailbox.provision`.
4. API returns `lease_id` and pending state.
5. Worker provisions or reactivates backend mailbox account.
6. Worker marks lease as `active`.

### 12.2 Mailbox Release

1. API marks lease as `releasing`.
2. Service enqueues `mailbox.release`.
3. Worker disables or deletes backend mailbox.
4. Worker marks lease as `released`.

### 12.3 Inbound Message Pipeline

1. Mail sync worker receives backend event.
2. Worker writes `raw_messages`.
3. Worker creates user-facing `messages_v2`.
4. Worker enqueues parse job.
5. Parser worker writes `message_parse_results`.
6. Webhook delivery jobs are enqueued.

### 12.4 Outbound Send

1. API validates auth, ownership, and entitlement.
2. Service creates `send_attempts` in `queued`.
3. Service enqueues `send.submit`.
4. Worker submits through Mail backend gateway.
5. Worker records result and events.

## 13. Parser Design

The current parser implementation can be kept as an initial built-in parser, but V2 should treat parsing as a versioned pipeline.

Requirements:
- parser version is stored
- parse results are append-only
- reparsing historical messages is supported
- failures are recorded explicitly

## 14. Observability

Every workflow should carry:
- `request_id`
- `job_id`
- `tenant_id`
- `mailbox_account_id`
- `mailbox_lease_id`
- `message_id`
- `send_attempt_id`
- `webhook_delivery_id`

## 15. Implementation Phases

### Phase 1

Deliver:
- new V2 tables
- Redis queue abstraction
- mailbox and send services
- mailbox provision and send jobs
- `docs/openapi-v2.yaml`

### Phase 2

Deliver:
- raw message and parse result pipeline
- parser worker
- webhook delivery jobs
- V1 compatibility paths backed by V2 internals

### Phase 3

Deliver:
- `/v2/*` public API
- read-model-backed admin and user APIs
- UI updates for new mailbox and send lifecycle

## 16. Acceptance Criteria

The V2 design is successful only if:
- mailbox accounts can exist without active leases
- lease changes do not depend on synchronous Mailu request lifetime
- inbound messages are deduped and reparsable
- outbound messages are auditable as first-class records
- webhook delivery state is queryable independently
- a new engineer can understand boundaries from code layout
