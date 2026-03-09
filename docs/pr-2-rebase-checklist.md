# PR #2 Rebase Checklist

This checklist is for [PR #2](https://github.com/haocn-ops/mailagents/pull/2):
`Persist webhook deliveries in first-class stores`

Use it only after [PR #1](https://github.com/haocn-ops/mailagents/pull/1) has merged into `master`.

## Goal

Rebase `codex/v2-webhook-deliveries` onto the updated `master` cleanly, then confirm that the webhook delivery persistence follow-up still matches the new base.

## Recommended command sequence

```bash
git checkout master
git pull origin master
git checkout codex/v2-webhook-deliveries
git rebase master
```

If conflicts appear:

```bash
git status
git add <resolved-files>
git rebase --continue
```

If the branch needs to be updated on GitHub after the rebase:

```bash
git push --force-with-lease origin codex/v2-webhook-deliveries
```

## Files most likely to conflict

- `src/storage/memory-store.js`
- `src/storage/postgres-store.js`
- `src/jobs/webhook-delivery-job.js`
- `docs/db-migration-v2.sql`
- `docs/openapi-v2.yaml`
- `test/fetch-app.test.js`
- `test/storage/memory-store-v2.test.js`

## What to verify after rebase

### 1. Storage path

- `recordWebhookDelivery` still writes first-class delivery records
- tenant/admin delivery history endpoints still prefer the first-class delivery store
- audit-log fallback still exists for non-migrated environments

### 2. Migration shape

- `docs/db-migration-v2.sql` still includes the required `webhook_deliveries` fields:
  - `event_type`
  - `resource_id`
  - `attempt_number`
  - `delivery_status`
  - `response_code`
  - `response_excerpt`
  - `error_message`
  - `request_id`
  - `delivered_at`

### 3. Route behavior

- `GET /v2/webhooks/deliveries` still returns the expected delivery history shape
- `GET /v1/admin/webhook-deliveries` still exposes failure context

### 4. Tests

Run:

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

Expected result:
- `56/56` passing, or the updated equivalent if `master` has legitimately added new tests

## Ready-for-review decision

Mark `#2` ready again only if:

- rebase is clean
- no first-class delivery fields were lost
- fallback behavior still exists
- regression tests pass
