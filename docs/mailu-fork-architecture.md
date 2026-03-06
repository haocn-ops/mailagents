# Mailu Fork Architecture

## 1. Purpose

This document defines the long-term mailbox architecture for Agent Mail Cloud.

The guiding rule is:

- `mailagents` is the control plane
- the Mailu fork is the mail data plane
- future mailbox features must be designed against this split first

## 2. Architecture Boundary

### 2.1 `mailagents` owns
- SIWE / DID / JWT
- tenant and agent identity
- mailbox lease policy
- billing and x402 enforcement
- admin dashboard and admin APIs
- audit logs and risk policies
- parsed message view for agents

### 2.2 Mailu fork owns
- real mailbox accounts and aliases
- mailbox domain and DNS-dependent mail flow
- SMTP / IMAP / storage
- raw inbound messages
- mailbox-level delivery state
- internal inbound events for new messages

## 3. Required Integration Shape

The Mailu fork must expose stable internal integration endpoints or workers for:

- mailbox provision
- mailbox release or disable
- mailbox lookup
- inbound mail notification
- raw message fetch
- mailbox reconciliation

Suggested internal interface surface:

- `POST /internal/mailboxes/provision`
- `POST /internal/mailboxes/release`
- `GET /internal/mailboxes/{address}`
- `POST /internal/inbound/events`
- `GET /internal/messages/{message_id}`

These are internal interfaces, not public customer APIs.

## 4. Provisioning Model

When `POST /v1/mailboxes/allocate` succeeds:

1. `mailagents` selects or creates a mailbox lease
2. `mailagents` calls the Mailu integration path
3. Mailu fork provisions or enables the real mailbox
4. provider metadata is stored in `mailboxes.provider_ref`
5. the mailbox is returned to the agent

When `POST /v1/mailboxes/release` succeeds:

1. `mailagents` marks the lease released
2. `mailagents` calls Mailu release/disable
3. Mailu fork disables or deletes the mailbox according to policy
4. the action is recorded in audit logs

## 5. Inbound Pipeline

Inbound mail should follow this path:

1. Mailu fork accepts the message for `inbox.<domain>`
2. Mailu stores the raw message
3. Mailu emits an internal event
4. `mailagents` parser worker consumes the event
5. parser writes `messages`
6. parser writes `message_events`
7. webhook dispatcher emits tenant webhooks if configured

This means `messages/latest` must be sourced from synchronized Mailu-backed data, not from a forwarding-only workaround.

## 6. Data Contract Expectations

At minimum, Mailu integration must return or preserve:

- mailbox address
- mailbox status
- provider reference
- message identifier
- received timestamp
- raw message reference

## 7. Development Rules

- Do not treat Mailu as a third-party SaaS dependency in future design work.
- Do not treat Email Routing or forwarding as the final inbox architecture.
- Temporary adapters are allowed only if explicitly marked as transitional.
- Any mailbox feature that touches real mail flow must update this document first.

## 8. Near-Term Implementation Plan

1. Keep the current provider abstraction as a temporary integration seam.
2. Replace “external Mailu REST provider” assumptions with “internal Mailu fork adapter”.
3. Add inbound synchronization from Mailu into `messages` and `message_events`.
4. Add reconciliation between local mailbox leases and Mailu mailbox state.
5. Add runbooks for DNS, MX, Mailu bootstrap, auth rotation, and disaster recovery.
