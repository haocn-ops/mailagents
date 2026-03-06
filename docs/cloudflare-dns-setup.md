# Cloudflare DNS Setup

Use this document when moving from the current API-only test deployment to a real single-host deployment with Mailu on the same VPS.

Current host:

- `149.28.123.3`
- API hostname: `api.mailagents.net`
- mailbox hostname: `inbox.mailagents.net`

## 1. API Records

Configure the control plane hostname in Cloudflare DNS:

| Type | Name | Value | Proxy |
| --- | --- | --- | --- |
| `A` | `api` | `149.28.123.3` | `Proxied` |

Notes:

- `api.mailagents.net` can stay behind the orange cloud because it only serves HTTP and HTTPS traffic.
- The current VPS test deployment is already reachable through this record.

## 2. Mailbox Records

Configure the mailbox hostname for the Mailu host:

| Type | Name | Value | Proxy |
| --- | --- | --- | --- |
| `A` | `inbox` | `149.28.123.3` | `DNS only` |
| `MX` | `inbox` | `inbox.mailagents.net` priority `10` | `DNS only` |

Notes:

- Mail protocols must not sit behind the Cloudflare orange cloud.
- `inbox.mailagents.net` is the receiving domain for allocated mailboxes such as `abc000-1@inbox.mailagents.net`.
- If `inbox.mailagents.net` does not resolve publicly, Mailu cutover cannot start.

## 3. Recommended Mail Authentication Records

Add the baseline records before live traffic:

| Type | Name | Value |
| --- | --- | --- |
| `TXT` | `inbox` | `v=spf1 mx -all` |
| `TXT` | `_dmarc.inbox` | `v=DMARC1; p=none; rua=mailto:dmarc@mailagents.net` |

DKIM depends on the final Mailu deployment keys. Do not create DKIM records until Mailu generates the real selector and public key.

## 4. Cloudflare Proxy Rules

Use this split:

- `api.mailagents.net`: proxied
- `inbox.mailagents.net`: DNS only

Do not proxy:

- SMTP
- SMTPS
- Submission
- IMAPS
- MX targets

## 5. Server Port Expectations

The single-host deployment should expose:

| Port | Purpose |
| --- | --- |
| `80` | API reverse proxy and ACME if used |
| `443` | API HTTPS |
| `25` | SMTP ingress |
| `465` | SMTPS |
| `587` | Submission |
| `993` | IMAPS |

The current VPS already has firewall rules opened for these ports.

## 6. Validation

After creating the DNS records, validate from the server:

```bash
bash scripts/check-mail-dns.sh mailagents.net 149.28.123.3
```

Expected checks:

- `api.mailagents.net` resolves
- `inbox.mailagents.net` resolves directly to `149.28.123.3`
- `inbox.mailagents.net` has an MX record

## 7. What This Does Not Finish

DNS alone does not make mail live. You still need:

1. a real Mailu deployment
2. TLS certificates for the mail hostnames
3. Mailu wired to the internal `mailagents` endpoints
4. final inbound mail smoke tests
