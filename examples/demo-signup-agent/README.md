# Demo: Signup Verification Agent

This demo allocates a mailbox lease, waits for a verification email, extracts an OTP or link, and sends a confirmation reply.

## Setup (10 minutes)

1. Ensure the API is reachable:

```bash
curl -s https://api.mailagents.net/healthz
```

2. Set environment variables:

```bash
cp .env.example .env
```

3. Follow the quickstart to obtain a JWT and `agent_id`:

- `docs/quickstart.md`

4. Run the demo:

```bash
node run.js
```

If you set `TO_EMAIL`, the demo will send a verification email to that address.

## Flow

The demo script:

- allocates a lease with purpose `signup`
- prints the leased inbox address
- optionally sends a verification email if `TO_EMAIL` is set
- releases the lease

## Expected Outcome

- You receive and parse the signup email.
- The agent sends a confirmation reply.
- The lease is released cleanly.
