# Mailu Integration Plan

This document describes the current transitional implementation state.

Authoritative architecture lives in `docs/mailu-fork-architecture.md`.

This file exists to explain the short-term adapter currently present in the codebase while we move toward the final Mailu fork boundary.

## Scope

- `mailagents` allocates and releases mailbox leases
- Mailu provisions and disables real mailboxes on `MAILBOX_DOMAIN`
- `mailagents` stores lease, billing, audit, and parsing state

## Current implementation status

- `MAIL_PROVIDER=noop|mailu`
- `MAIL_PROVIDER=mailu` currently uses a transitional internal adapter
- the adapter still talks to Mailu REST API paths directly
- `allocateMailbox` now calls the configured mail backend adapter
- `releaseMailbox` now disables or deletes the Mailu user, depending on `MAILU_RELEASE_MODE`

## Mailu API endpoints in use

- `GET /api/v1/domain/{domain}`
- `POST /api/v1/domain`
- `POST /api/v1/user`
- `PATCH /api/v1/user/{email}`
- `DELETE /api/v1/user/{email}`

## Required environment variables

- `MAIL_PROVIDER=mailu`
- `MAILBOX_DOMAIN=inbox.mailagents.net`
- `MAILU_BASE_URL=https://mailu.example.com`
- `MAILU_API_TOKEN=<api token>`
- `MAILU_RELEASE_MODE=disable|delete`
- `MAILU_QUOTA_BYTES=1073741824`
- `MAILU_AUTH_SCHEME=BEARER|RAW`

## Operational notes

- `disable` is the safer release mode for V1 because it preserves mailbox state for debugging and audit.
- `delete` is more aggressive and should only be used when you are sure no delayed inbound mail needs to be inspected.

## Remaining work

1. Replace the direct REST assumptions with an internal Mailu fork integration boundary.
2. Persist Mailu mailbox credentials or switch to a shared admin retrieval path.
3. Add inbound sync from Mailu mail storage into `messages` and `message_events`.
4. Add reconciliation jobs for local mailbox records versus Mailu state.
5. Add runbooks for Mailu API auth rotation and domain bootstrap.
