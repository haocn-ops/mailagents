# Examples

These examples are minimal, 10-minute demos that show how agents use mailbox leases for real workflows.

- `demo-signup-agent` — signup + verification email flow
- `demo-support-triage` — inbound support mailbox with agent reply
- `demo-alerts-escalation` — alerts inbox that escalates and acknowledges

Each demo uses the public HTTP API and the lease lifecycle:

1. Authenticate (SIWE)
2. Allocate a lease
3. Receive and parse inbound mail
4. Send a reply
5. Release the lease

Start with `docs/quickstart.md` if you are new to the API.

All demos include a `run.js` script. Set `API_BASE`, `ACCESS_TOKEN`, and `AGENT_ID`, then run:

```bash
node run.js
```
