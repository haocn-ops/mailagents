# Documentation Index

- [User Guide](./user-guide.md)
- [Development Spec](./development.md)
- [Mailu Fork Architecture](./mailu-fork-architecture.md)
- [Mailu Internal API](./mailu-internal-api.md)
- [Mailbox Reconciliation](./mailbox-reconciliation.md)
- [Production Runbook](./production-runbook.md)
- [Mailu Cutover Checklist](./mailu-cutover-checklist.md)
- [Infrastructure Topology](./infrastructure-topology.md)
- [Cloudflare DNS Setup](./cloudflare-dns-setup.md)
- [Single-Host Deployment](./single-host-deployment.md)
- [Admin Dashboard Design](./admin-dashboard.md)
- [Business API Contract](./openapi.yaml)
- [Admin API Contract](./openapi-admin.yaml)
- [Database DDL](./db/schema.sql)

## Suggested Reading Order

1. `user-guide.md` - setup, API workflow, troubleshooting
2. `development.md` - scope, architecture, milestones
3. `mailu-fork-architecture.md` - mailbox backend boundary and future implementation rule
4. `mailu-internal-api.md` - internal Mailu fork to control-plane contract
5. `production-runbook.md` - production rollout, verification, and rollback
6. `mailu-cutover-checklist.md` - real Mailu cutover and acceptance checklist
7. `infrastructure-topology.md` - recommended production topology and cutover order
8. `cloudflare-dns-setup.md` - exact DNS and MX records for Cloudflare
9. `single-host-deployment.md` - one-place deployment path on a VPS or cloud host
10. `openapi.yaml` - business API contract
11. `admin-dashboard.md` - dashboard IA and operation flows
12. `openapi-admin.yaml` - admin API contract
13. `db/schema.sql` - schema implementation
