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

## Flow

1. Allocate a lease:

```bash
curl -s "$API_BASE/v2/mailboxes/leases" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $ACCESS_TOKEN" \
  -H "x-payment-proof: $PAYMENT_PROOF" \
  -d "{\"agent_id\":\"$AGENT_ID\",\"purpose\":\"signup\",\"ttl_hours\":1}"
```

2. Send a signup request from a test service to the leased inbox address.

3. Fetch messages and extract OTP or verification link:

```bash
curl -s "$API_BASE/v2/messages?mailbox_id=$MAILBOX_ID&limit=5" \
  -H "authorization: Bearer $ACCESS_TOKEN" \
  -H "x-payment-proof: $PAYMENT_PROOF"
```

4. Send confirmation or follow-up mail:

```bash
curl -s "$API_BASE/v2/messages/send" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $ACCESS_TOKEN" \
  -H "x-payment-proof: $PAYMENT_PROOF" \
  -d "{\"mailbox_id\":\"$MAILBOX_ID\",\"mailbox_password\":\"$MAILBOX_PASSWORD\",\"to\":[\"support@example.com\"],\"subject\":\"Signup verified\",\"text\":\"OTP verified\"}"
```

5. Release the lease:

```bash
curl -s "$API_BASE/v2/mailboxes/leases/$LEASE_ID/release" \
  -H "authorization: Bearer $ACCESS_TOKEN"
```

## Expected Outcome

- You receive and parse the signup email.
- The agent sends a confirmation reply.
- The lease is released cleanly.
