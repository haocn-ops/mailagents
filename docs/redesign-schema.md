# Agent Mail Cloud Redesign Schema

## 1. Purpose

This document proposes the V2 data model that matches the redesign architecture.

The main correction is explicit separation of:
- mailbox account
- mailbox lease
- raw message source
- parsed message result
- outbound send attempt

## 2. Key Model Changes

## 2.1 Mailbox account vs lease
V1 overloaded `mailboxes` for both backend mailbox identity and lease-visible state.

V2 should split this into:
- `mailbox_accounts`
- `mailbox_leases`

## 2.2 Message vs parse result
V1 stored parsed fields too close to the canonical message row.

V2 should split this into:
- `messages`
- `message_parse_results`
- optional `raw_messages`

## 2.3 Outbound records become first-class
V1 could send mail but did not model send lifecycle deeply enough.

V2 should introduce:
- `send_attempts`
- `send_attempt_events`

## 3. Proposed Tables

## 3.1 mailbox_accounts
Purpose:
- real backend mailbox resource

Fields:
- `id`
- `address` unique
- `domain`
- `backend_ref`
- `backend_status` (`provisioning`, `active`, `disabled`, `error`)
- `auth_login`
- `last_password_reset_at`
- `mailbox_type` (`pooled`, `dedicated`)
- `created_at`
- `updated_at`

## 3.2 mailbox_leases
Purpose:
- product assignment of mailbox accounts

Fields:
- `id`
- `mailbox_account_id`
- `tenant_id`
- `agent_id`
- `lease_status` (`pending`, `active`, `releasing`, `released`, `expired`, `frozen`)
- `purpose`
- `started_at`
- `ends_at`
- `released_at`
- `created_at`
- `updated_at`

Constraints:
- at most one active lease per mailbox account

## 3.3 mailbox_account_events
Purpose:
- audit-like backend lifecycle history

Examples:
- provision requested
- backend provisioned
- backend disabled
- credentials reset
- reconcile repaired

## 3.4 raw_messages
Purpose:
- stable source reference for reparsing

Fields:
- `id`
- `mailbox_account_id`
- `backend_message_id`
- `raw_ref`
- `headers_json`
- `sender`
- `sender_domain`
- `subject`
- `received_at`
- `ingested_at`

Constraint:
- unique on (`mailbox_account_id`, `backend_message_id`)

## 3.5 messages
Purpose:
- normalized user-facing message record

Fields:
- `id`
- `raw_message_id`
- `tenant_id`
- `agent_id`
- `mailbox_account_id`
- `mailbox_lease_id`
- `from_address`
- `subject`
- `received_at`
- `message_status` (`received`, `parsed`, `parse_failed`, `archived`)
- `created_at`

## 3.6 message_parse_results
Purpose:
- parser outputs with versioning

Fields:
- `id`
- `message_id`
- `parser_version`
- `parse_status` (`parsed`, `failed`, `partial`)
- `otp_code`
- `verification_link`
- `text_excerpt`
- `confidence`
- `error_code`
- `created_at`

Constraint:
- multiple rows allowed per message
- exactly one row can be marked current if desired via flag or view

## 3.7 send_attempts
Purpose:
- first-class outbound mail send lifecycle

Fields:
- `id`
- `tenant_id`
- `agent_id`
- `mailbox_account_id`
- `mailbox_lease_id`
- `from_address`
- `to_json`
- `cc_json`
- `bcc_json`
- `subject`
- `text_body_ref`
- `html_body_ref`
- `submission_status` (`queued`, `submitting`, `accepted`, `failed`)
- `backend_queue_id`
- `smtp_response`
- `submitted_at`
- `created_at`
- `updated_at`

## 3.8 send_attempt_events
Purpose:
- detailed send audit trail

Examples:
- queued
- smtp auth started
- accepted by relay
- temporary failure
- permanent failure

## 3.9 webhook_deliveries
Purpose:
- move delivery state out of the webhook definition row

Fields:
- `id`
- `webhook_id`
- `event_type`
- `resource_id`
- `attempt_number`
- `delivery_status`
- `response_code`
- `response_excerpt`
- `delivered_at`
- `created_at`

## 4. Read Models

The tenant-facing API should not query every raw table directly.

Recommended read models or views:
- `tenant_mailbox_view`
- `tenant_message_latest_view`
- `tenant_send_attempt_view`
- `admin_mailbox_health_view`

## 5. Queue-Driven State Changes

These state changes should be asynchronous:
- mailbox account provisioning
- mailbox account disable or release
- password reset issuance
- inbound message ingest
- parser execution
- webhook delivery
- outbound send submission
- reconciliation repair

Each of these should produce durable events or event rows.

## 6. Migration Path from Current Schema

## 6.1 Phase A
Add new tables without changing live APIs:
- `mailbox_accounts`
- `raw_messages`
- `message_parse_results`
- `send_attempts`
- `send_attempt_events`
- `webhook_deliveries`

## 6.2 Phase B
Backfill from current tables:
- map current `mailboxes` into `mailbox_accounts`
- map current `mailbox_leases` into new lease model if column changes are needed
- derive `raw_messages` and `message_parse_results` from current `messages` and `message_events`

## 6.3 Phase C
Move application writes:
- allocate writes account + lease state separately
- inbound sync writes `raw_messages` first
- parser writes `message_parse_results`
- send API writes `send_attempts`

## 6.4 Phase D
Move application reads:
- `/messages/latest` reads current parse result view
- `/mailboxes` reads tenant mailbox view
- admin reads health views

## 7. Why This Schema Is Better

Benefits:
- reparsing does not mutate canonical message identity blindly
- mailbox lifecycle becomes auditable and less coupled
- send mail becomes observable and operable
- backend sync issues become easier to diagnose
- V2 workers have clean write targets

## 8. Recommended Constraints and Indexes

Add at minimum:
- unique index on `mailbox_accounts.address`
- unique index on `raw_messages(mailbox_account_id, backend_message_id)`
- partial unique index for one active lease per mailbox account
- index on `messages(tenant_id, received_at desc)`
- index on `send_attempts(tenant_id, created_at desc)`
- index on `webhook_deliveries(webhook_id, created_at desc)`

## 9. Operational Rule

No future mailbox, parser, or send-mail feature should be added directly to the old V1 schema shape without first checking whether it belongs in one of these separated V2 models.
