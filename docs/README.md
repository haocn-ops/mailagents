# Documentation Index

- [User Guide](./user-guide.md)
- [Development Spec](./development.md)
- [Redesign Architecture](./redesign-architecture.md)
- [Redesign Schema](./redesign-schema.md)
- [Mailu Fork Architecture](./mailu-fork-architecture.md)
- [Mailu Internal API](./mailu-internal-api.md)
- [Mailbox Reconciliation](./mailbox-reconciliation.md)
- [Production Runbook](./production-runbook.md)
- [Mailu Cutover Checklist](./mailu-cutover-checklist.md)
- [Infrastructure Topology](./infrastructure-topology.md)
- [Cloudflare DNS Setup](./cloudflare-dns-setup.md)
- [Mailu Host Preparation](./mailu-host-prep.md)
- [Mailu Setup Download](./mailu-setup-download.md)
- [Mailu Colocated Rewrite](./mailu-colocated-rewrite.md)
- [Mailu Certificate Renewal](./mailu-cert-renewal.md)
- [Mail Auth Setup](./mail-auth-setup.md)
- [Project Retrospective](./project-retrospective.md)
- [Current Production State](./current-production-state.md)
- [Agent API Example](./agent-api-example.md)
- [Single-Host Deployment](./single-host-deployment.md)
- [Admin Dashboard Design](./admin-dashboard.md)
- [Business API Contract](./openapi.yaml)
- [V2 Preview API Contract](./openapi-v2.yaml)
- [Admin API Contract](./openapi-admin.yaml)
- [V2 Technical Design](./mailagents-v2-technical-design.md)
- [V2 Business API Draft](./openapi-v2.yaml)
- [V2 Admin API Draft](./openapi-admin-v2.yaml)
- [V2 Additive DB Migration](./db-migration-v2.sql)
- [V2 Sprint 1 Plan](./sprint-1-implementation-plan.md)
- [V2 Sprint 2 Plan](./sprint-2-implementation-plan.md)
- [V2 Sprint 1 PR Summary](./pr-sprint-1-v2-foundation.md)
- [Database DDL](./db/schema.sql)

## Suggested Reading Order

1. `user-guide.md` - setup, API workflow, troubleshooting
2. `development.md` - V1 scope, architecture, milestones
3. `redesign-architecture.md` - recommended V2 target architecture and service boundaries
4. `redesign-schema.md` - recommended V2 data model split and migration shape
5. `mailu-fork-architecture.md` - mailbox backend boundary and future implementation rule
6. `mailu-internal-api.md` - internal Mailu fork to control-plane contract
7. `production-runbook.md` - production rollout, verification, and rollback
8. `mailu-cutover-checklist.md` - real Mailu cutover and acceptance checklist
9. `infrastructure-topology.md` - recommended production topology and cutover order
10. `cloudflare-dns-setup.md` - exact DNS and MX records for Cloudflare
11. `mailu-host-prep.md` - host preparation, port ownership, and directory layout for Mailu
12. `mailu-setup-download.md` - fetch the official Mailu generated compose/env files from a setup id
13. `mailu-colocated-rewrite.md` - adapt the generated Mailu baseline to a host already running Nginx
14. `mailu-cert-renewal.md` - keep Mailu mail TLS in sync with host Let's Encrypt renewal
15. `single-host-deployment.md` - one-place deployment path on a VPS or cloud host
16. `project-retrospective.md` - implementation review, key corrections, and final product shape
17. `current-production-state.md` - live capabilities, runtime mode, and current deployment caveats
18. `agent-api-example.md` - minimal agent workflow for sign-in, allocate, read, send, and release
19. `openapi.yaml` - business API contract
20. `openapi-v2.yaml` - current V2 preview contract implemented on top of the main control plane
21. `admin-dashboard.md` - dashboard IA and operation flows
22. `openapi-admin.yaml` - admin API contract
23. `mailagents-v2-technical-design.md` - integrated V2 technical design and migration target
24. `openapi-admin-v2.yaml` - proposed V2 admin API contract
25. `db-migration-v2.sql` - additive V2 schema migration draft
26. `sprint-1-implementation-plan.md` - first implementation sprint breakdown
27. `sprint-2-implementation-plan.md` - second implementation sprint focused on V2 route hardening, read-model split, parser jobs, and webhook persistence
28. `pr-sprint-1-v2-foundation.md` - reviewer-oriented summary of the Sprint 1 implementation branch
29. `db/schema.sql` - current schema implementation
