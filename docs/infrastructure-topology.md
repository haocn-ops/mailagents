# Infrastructure Topology

This document defines the recommended first production topology for Agent Mail Cloud.

Current preferred deployment mode:

- single-host VPS or cloud instance
- Docker Compose for `mailagents`
- Mailu fork deployed on the same host or same private network

## 1. Recommended Layout

Use three independent infrastructure units:

1. Control plane runtime
2. PostgreSQL
3. Mailu fork runtime

## 2. Recommended Hostnames

- `api.mailagents.net`
  - public API
  - admin dashboard
  - internal `/internal/*` endpoints for Mailu fork callbacks

- `inbox.mailagents.net`
  - mailbox domain for allocated inboxes
  - SMTP / IMAP / MX handled by Mailu fork

- `mailu.internal.mailagents.net`
  - internal Mailu management endpoint used by the control plane
  - not exposed publicly unless required by your ingress model

## 3. Minimal Network Model

### Public

- `443` to `api.mailagents.net`
- `25`, `465`, `587`, `993` to Mailu fork ingress as required

### Private

- control plane -> PostgreSQL
- control plane -> Mailu management endpoint
- Mailu fork -> control plane `/internal/*`

## 4. Trust Boundaries

### Control plane

- stores tenant, lease, billing, audit, and parsed message views
- never exposes `INTERNAL_API_TOKEN` publicly
- owns webhook signing secrets

### Mailu fork

- stores raw mail and mailbox state
- owns SMTP/IMAP and mail delivery state
- should not own billing or tenant business logic

## 5. First Production Rollout Recommendation

- one VPS or cloud instance as the first production host
- Docker Compose for `mailagents`
- PostgreSQL on the same host for initial simplicity, or move it out later
- Mailu fork on the same host if you want one-place deployment

If you colocate API, PostgreSQL, and Mailu on one host, use at least:

- 4 vCPU
- 8 GB RAM
- 100+ GB SSD

Do not colocate all components on a tiny host.

## 6. Operational Baselines

- daily PostgreSQL backups
- Mailu mailstore backups
- centralized logs for:
  - API runtime
  - Mailu fork
  - reverse proxy / ingress
- alerts for:
  - `/healthz` failures
  - webhook success rate drop
  - inbound parse success rate drop
  - reconciliation drift

## 7. Cutover Order

1. provision PostgreSQL
2. provision control plane
3. run `npm run preflight:prod`
4. run `npm run db:upgrade` if needed
5. deploy Mailu fork
6. configure DNS / MX
7. validate Mailu internal callbacks
8. run production verification
9. cut traffic
