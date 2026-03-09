# PR Review Comment Template

This template is intended for [PR #1](https://github.com/haocn-ops/mailagents/pull/1) first, and can be reused for [PR #2](https://github.com/haocn-ops/mailagents/pull/2) after rebasing.

## High-level review comment

```text
Review summary

This PR is acceptable in direction and scope for a V2 foundation branch. The main things I checked were:
- V1 compatibility remained intact
- V2 routes are coherent enough for alpha use
- queue/job boundaries are clearer than before
- dual-write and read-model behavior are at least test-covered in memory mode

Before merge, I want confidence on:
- docs and implemented /v2 endpoints still matching exactly
- no hidden coupling introduced in fetch-app.js route flow
- follow-up scope staying out of this PR
```

## Approval comment

```text
Approved with the current scope.

What looks good:
- V2 routes are now real runtime behavior, not only design docs
- mailbox/message/send flows have clearer service and job boundaries
- inbound parse and webhook delivery are no longer request-path-only logic
- tests cover the main compatibility and migration paths

Suggested next step after merge:
- rebase PR #2 and continue the webhook delivery persistence work there
```

## Request changes comment

```text
Requesting changes before merge.

The main blockers are:
1. A V1 compatibility path appears to have drifted from current behavior.
2. A documented /v2 contract does not match the implemented route behavior.
3. A queue/job transition point is not durable enough yet or is insufficiently covered by tests.

I would re-check:
- src/fetch-app.js
- src/storage/memory-store.js
- src/storage/postgres-store.js
- docs/openapi-v2.yaml
- test/fetch-app.test.js
```

## Targeted finding template

Use this shape for inline review comments:

```text
[Severity] Short title

Why this matters:
- describe the behavioral risk or migration risk

What I observed:
- mention the route, store method, job, or test gap

What I want changed:
- one concrete fix or one concrete test
```

Example:

```text
[P1] V1 send response drift

Why this matters:
- existing clients still depend on the current synchronous response shape

What I observed:
- the V2 send-attempt work changed the route but the compatibility surface is still part of the public contract

What I want changed:
- either preserve the old fields exactly or update the compatibility tests to prove the intended drift
```

## Merge recommendation checklist comment

```text
Merge recommendation checklist

- V1 compatibility confirmed
- /v2 docs and implementation aligned
- queue-backed flows covered by tests
- no unrelated follow-up changes mixed into the PR
- CI green

If all five are true, I’m comfortable merging PR #1 and rebasing PR #2 afterward.
```
