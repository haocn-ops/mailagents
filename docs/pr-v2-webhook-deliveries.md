# PR Title

Persist webhook deliveries in first-class stores

# PR Body

## Summary

This PR is a follow-up to [#1](https://github.com/haocn-ops/mailagents/pull/1).

PR #1 introduced webhook delivery history endpoints, but those reads were still derived from `audit_logs`.
This branch moves webhook delivery history toward a first-class data model:
- memory store now persists webhook deliveries separately
- postgres store writes to `webhook_deliveries` when that table exists
- tenant and admin delivery history endpoints prefer the first-class delivery store and only fall back to audit-derived reads when needed

## Main changes

### Data model

Updated `docs/db-migration-v2.sql`:
- `webhook_deliveries` now includes:
  - `error_message`
  - `request_id`

### Storage

Memory:
- added `webhookDeliveries` state
- `recordWebhookDelivery` now writes a first-class delivery record

Postgres:
- V2 table availability now detects `webhook_deliveries`
- `recordWebhookDelivery` writes to `webhook_deliveries` when present
- tenant/admin read methods prefer `webhook_deliveries` and fall back to `audit_logs` when the migration has not been applied yet

### Job payload

Updated `webhook.deliver` write metadata so persisted delivery records can carry:
- `event_type`
- `resource_id`
- `attempts`
- `error_message`
- `response_excerpt`

## Compatibility

This PR is additive.

Current behavior:
- existing delivery history endpoints stay the same
- instances that have not applied the `webhook_deliveries` migration still work via audit-log fallback
- instances that have applied the migration start using the first-class table automatically

## Validation

Test command run on this branch:

```bash
node --test \
  test/storage/memory-store-v2.test.js \
  test/fetch-app.test.js \
  test/jobs/webhook-delivery-job.test.js \
  test/webhook-dispatcher.test.js \
  test/preflight.test.js \
  test/services/mailbox-service.test.js \
  test/services/send-service.test.js \
  test/jobs/mailbox-provision-job.test.js \
  test/jobs/send-submit-job.test.js \
  test/jobs/mailbox-release-job.test.js \
  test/jobs/mailbox-credentials-reset-job.test.js \
  test/jobs/message-parse-job.test.js
```

Result:
- `56/56` passing

## Follow-up

Recommended next step after this PR:
- add explicit OpenAPI/admin documentation for webhook delivery history and then remove the audit-log fallback after migration rollout
