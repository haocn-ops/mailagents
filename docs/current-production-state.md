# Current Production State

## Live Endpoints

- API: `https://api.mailagents.net`
- User Workspace: `https://api.mailagents.net/app`
- Admin Dashboard: `https://api.mailagents.net/admin`
- Mailu Admin: `https://inbox.mailagents.net/admin/`
- Webmail: `https://inbox.mailagents.net/webmail/`

## Deployment Shape

Production currently runs on one VPS and hosts:

- `mailagents` API
- PostgreSQL
- Mailu
- Nginx / TLS termination

DNS split:

- `api.mailagents.net` -> control plane
- `inbox.mailagents.net` -> mail domain and Mailu

## Runtime Modes

Current runtime is:

- `SIWE_MODE=strict`
- `PAYMENT_MODE=hmac`

Wallet logins require:

- MetaMask or compatible injected wallet
- the configured chain
- SIWE signature verification

Protected mailbox/message actions require:

- short-lived HMAC payment proofs issued by the backend

## Working User Capabilities

The user workspace currently supports:

- MetaMask sign-in
- mailbox allocation
- mailbox selection
- Webmail password issuance/reset
- copy address / login / password / token / wallet
- latest message fetch
- message detail fetch
- webhook creation and listing
- usage summary
- invoice listing and detail lookup

## Working Mail Capabilities

The mail system currently supports:

- real inbound mail reception on `inbox.mailagents.net`
- Maildir sync into the control plane
- OTP extraction
- verification link extraction
- Webmail login
- IMAP/SMTP authenticated mailbox access
- outbound mail accepted by Gmail-class receivers

Mail authentication is configured with:

- PTR
- SPF
- DKIM
- DMARC

## Working Operator Capabilities

The admin dashboard currently supports:

- overview
- tenant inspection
- mailbox inspection
- message inspection
- webhook inspection
- billing inspection
- risk inspection
- audit inspection

## Operational Caveat

The current VPS deployment still carries one deliberate operational shortcut:

- startup preflight enforcement is patched off on the server-side compose file during deploy

This is intentional for the current live environment and should be removed only after the deployment is fully aligned with the stricter production gate configuration.

## Recommended Next Hardening Steps

1. Add monitoring and alerting
2. Add backup and restore verification
3. Remove the temporary startup gate bypass
4. Improve secret rotation workflows
5. Expand user mailbox management UX
