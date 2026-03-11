# Demo: Support Triage Agent

This demo provisions a support inbox, classifies inbound requests, and replies with a short acknowledgement.

## Setup (10 minutes)

1. Set environment variables:

```bash
cp .env.example .env
```

2. Use `docs/quickstart.md` to obtain a JWT and `agent_id`.

## Flow

1. Allocate a lease:

```bash
curl -s "$API_BASE/v2/mailboxes/leases" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $ACCESS_TOKEN" \
  -H "x-payment-proof: $PAYMENT_PROOF" \
  -d "{\"agent_id\":\"$AGENT_ID\",\"purpose\":\"support-triage\",\"ttl_hours\":2}"
```

2. Send a test support email to the leased address.

3. Fetch latest messages:

```bash
curl -s "$API_BASE/v2/messages?mailbox_id=$MAILBOX_ID&limit=3" \
  -H "authorization: Bearer $ACCESS_TOKEN" \
  -H "x-payment-proof: $PAYMENT_PROOF"
```

4. Send an acknowledgement reply:

```bash
curl -s "$API_BASE/v2/messages/send" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $ACCESS_TOKEN" \
  -H "x-payment-proof: $PAYMENT_PROOF" \
  -d "{\"mailbox_id\":\"$MAILBOX_ID\",\"mailbox_password\":\"$MAILBOX_PASSWORD\",\"to\":[\"customer@example.com\"],\"subject\":\"We received your request\",\"text\":\"Thanks, an agent is reviewing your request.\"}"
```

5. Release the lease:

```bash
curl -s "$API_BASE/v2/mailboxes/leases/$LEASE_ID/release" \
  -H "authorization: Bearer $ACCESS_TOKEN"
```

## Expected Outcome

- Support email is received and parsed.
- Acknowledgement is sent automatically.
- Lease is released when finished.
