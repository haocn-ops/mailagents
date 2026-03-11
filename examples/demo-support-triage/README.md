# Demo: Support Triage Agent

This demo provisions a support inbox, classifies inbound requests, and replies with a short acknowledgement.

## Setup (10 minutes)

1. Set environment variables:

```bash
cp .env.example .env
```

2. Use `docs/quickstart.md` to obtain a JWT and `agent_id`.

## Flow

The demo script:

- allocates a lease with purpose `support-triage`
- prints the leased inbox address
- optionally sends an acknowledgement email if `TO_EMAIL` is set
- releases the lease

## Expected Outcome

- Support email is received and parsed.
- Acknowledgement is sent automatically.
- Lease is released when finished.
