# Project Retrospective

## Summary

This project started as a V1 API scaffold and ended as a working single-host mail platform with:

- wallet-based user sign-in
- dynamic mailbox allocation
- real inbound mail handling
- OTP and verification link extraction
- live user workspace and admin dashboard
- Webmail login and SMTP/IMAP access
- outbound delivery accepted by Gmail-class receivers

The final production shape is:

- `api.mailagents.net` for the control plane
- `inbox.mailagents.net` for the mail domain and Mailu
- one VPS running API, PostgreSQL, Mailu, and Nginx

## Initial Goal

The original goal was to build an agent-facing mailbox platform based on the development documents:

- mailbox lease and lifecycle management
- API-first control plane
- admin visibility
- real mailbox infrastructure under the product

During implementation, the project moved from a mock-first scaffold to a real deployed system with live mail flow.

## Major Phases

### 1. API scaffold

The first phase built the control plane contract:

- SIWE challenge and verify
- mailbox allocate and release
- latest message fetch
- webhook registration
- usage summary
- invoice lookup

This phase established the public API and test harness.

### 2. Runtime and storage hardening

The second phase added:

- switchable `memory` and `postgres` backends
- `mock` and `hmac` payment modes
- `mock` and `strict` SIWE modes
- Docker Compose setup
- smoke tests
- health checks

This made the scaffold usable beyond local prototyping.

### 3. Admin control surface

The project then added a real admin dashboard and backed it with live admin APIs:

- overview
- tenants
- mailboxes
- messages
- webhooks
- billing
- risk
- audit

At this point, the product had a working operator-facing control plane.

### 4. Mail architecture correction

The early implementation treated mail infrastructure too much like an external provider integration.

That was corrected by aligning the codebase with the architecture documents:

- `mailagents` as the control plane
- Mailu as the real mail data plane
- explicit internal contracts for mailbox and inbound sync

This was the key direction correction in the project.

### 5. Mailu deployment and real mail flow

The next phase moved from simulation to real infrastructure:

- deployed Mailu on the VPS
- configured `inbox.mailagents.net`
- enabled SMTP, IMAP, and Webmail
- added Maildir sync into the control plane
- connected parsed messages back into the product

This was the point where the system became a real mail product rather than a control API only.

### 6. Production mail deliverability

To make outbound mail work against Gmail-class receivers, the deployment was completed with:

- PTR / reverse DNS
- SPF
- DKIM
- DMARC

Once these were in place, authenticated outbound mail from real mailbox users was accepted successfully.

### 7. User workspace completion

The user-facing workspace at `/app` was expanded into a real operational surface:

- MetaMask-based sign-in
- mailbox allocation
- mailbox credential issuance
- message list and message detail
- webhook creation and listing
- usage and invoice lookup
- copy actions for mailbox credentials and tokens

At this point, the user flow was end-to-end usable.

## Critical Issues Solved

### Strict SIWE failure

Two real issues blocked wallet sign-in:

- the front end required a wallet address before connecting MetaMask
- strict SIWE message generation failed on non-checksummed addresses

The final fix was:

- connect MetaMask first
- preserve the original wallet address in the browser
- checksum the address on the server before creating the SIWE message

### Wrong latest-message ordering

Example seeded messages originally outranked real inbound mail in the latest-message query.

That was corrected so real inbound mail now appears first when users fetch recent messages.

### Historical parser mismatch

Older stored messages had incorrect OTP parsing state. A reparse tool was added and run to bring old data in line with the improved parser.

### PostgreSQL production schema mismatches

Live queries exposed mismatches between code assumptions and the actual database schema. Those were corrected in mailbox listing and lease timestamp handling.

## Final User Flow

The current user flow is:

1. Open `/app`
2. Connect MetaMask
3. Sign the SIWE challenge
4. Receive a tenant JWT
5. Allocate a mailbox
6. Issue Webmail credentials
7. Open Webmail for full inbox usage
8. Read parsed OTPs and verification links from the control plane
9. Send mail through the real mailbox account

## Final Operator Flow

The current operator flow is:

1. Open `/admin`
2. Inspect live tenants, mailboxes, messages, webhooks, usage, billing, risk, and audit data
3. Operate against real backend state
4. Use Mailu admin for mail infrastructure tasks when needed

## Current Production State

The system is currently usable for:

- user wallet sign-in
- mailbox allocation
- Webmail access
- inbound mail reception
- OTP extraction
- webhook registration
- usage and invoice lookup
- outbound mail accepted by Gmail

The production entry points are:

- `https://api.mailagents.net/app`
- `https://api.mailagents.net/admin`
- `https://inbox.mailagents.net/webmail/`

## Remaining Work

The system is usable, but still has natural next steps:

- monitoring and alerting
- centralized log handling
- backup and restore drills
- further Mailu integration hardening
- deeper user-side mailbox management UX
- stronger secret rotation and operational runbooks

## Conclusion

The project reached the intended threshold:

- real control plane
- real mail infrastructure
- real user login
- real mailbox usage
- real inbound and outbound mail

This is no longer a scaffold or demo. It is a working deployed system with a clear path for further hardening.
