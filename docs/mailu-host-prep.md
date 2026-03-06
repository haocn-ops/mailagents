# Mailu Host Preparation

Use this document before deploying the real Mailu stack on the same VPS as `mailagents`.

This repository does not ship the final Mailu fork compose files. The goal here is to prepare the host correctly so the later Mailu deployment is predictable and does not conflict with the control plane.

## 1. Deployment Model

Recommended model on one host:

- `mailagents` API stays behind the existing host Nginx
- Mailu runs in Docker on the same host
- Mail protocols stay on public ports:
  - `25`
  - `465`
  - `587`
  - `993`
- Mailu web frontend listens on loopback ports only
- Host Nginx reverse proxies the Mailu web UI by hostname if needed

This avoids a direct port fight between the host Nginx and Mailu on `80` and `443`.

## 2. Why This Matters

Mailu upstream documents two constraints:

- the host must expose the mail ports for Mailu
- if another reverse proxy already owns `80` and `443`, Mailu should be placed behind that proxy and bound locally on alternate loopback ports

This is the correct pattern for the current VPS because:

- `api.mailagents.net` already uses host Nginx
- the VPS already terminates HTTP and HTTPS for the control plane
- `inbox.mailagents.net` should serve mail protocols directly, not through Cloudflare proxying

## 3. Required Host State

Before Mailu is deployed, confirm:

1. Docker is installed and running
2. `25`, `465`, `587`, and `993` are open in the firewall
3. `inbox.mailagents.net` resolves to the VPS public IP
4. `MX inbox.mailagents.net -> inbox.mailagents.net`
5. `/mailu` exists on the host with enough free disk
6. host Nginx owns `80` and `443`
7. no other local service owns the mail ports
8. swap exists on smaller hosts to absorb spikes when Mailu starts

## 4. Directory Layout

Create and reserve this host layout:

```text
/mailu
/mailu/data
/mailu/dkim
/mailu/mail
/mailu/overrides
/mailu/certs
/mailu/config
```

These paths are intentionally stable so the future Mailu fork compose files can be dropped in without changing the rest of the host automation.

## 5. Reverse Proxy Pattern

Mailu should not publish `80` and `443` directly on the host in this setup.

Instead:

- Mailu web frontend binds to `127.0.0.1:8080`
- Mailu HTTPS frontend binds to `127.0.0.1:8443`
- host Nginx proxies:
  - `mail.mailagents.net`
  - or `admin.inbox.mailagents.net`
  - or another chosen Mailu web hostname

Do not proxy SMTP or IMAP through Cloudflare.

## 6. Mailu Web Hostname

Do not reuse `inbox.mailagents.net` as the web admin hostname.

Keep these roles separate:

- `api.mailagents.net` for the control plane
- `inbox.mailagents.net` for mailbox addresses and MX
- `mail.mailagents.net` for Mailu webmail/admin if exposed

## 7. Suggested First Mailu Config Decisions

When generating the real Mailu compose files, use:

- stable Mailu release, not `latest`
- external reverse proxy mode
- TLS handled by the host reverse proxy or by Mailu in mail-only mode
- a dedicated admin user and postmaster identity
- no ClamAV on the current small VPS unless you accept the memory hit
- existing swap used only as safety headroom, not as a RAM substitute

## 8. Validation

Run the host preparation script:

```bash
bash scripts/prepare-mailu-host.sh
```

For a remote host:

```bash
ssh root@your-host 'bash -s' < scripts/prepare-mailu-host.sh
```

For the host-side reverse proxy, start from:

```text
deploy/nginx/mailu-web.conf.example
```

## 9. Not Done Yet

This still does not deploy Mailu itself. You will still need:

1. Mailu compose files generated from the official setup tool or your Mailu fork repo
2. Mailu environment configuration
3. DKIM keys and DNS records
4. integration of Mailu callbacks into `mailagents`
5. final cutover tests
