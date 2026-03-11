# Demo: Alerts Escalation Agent

This demo allocates an alerts inbox, watches for high-severity notifications, and sends escalation notices.

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
  -d "{\"agent_id\":\"$AGENT_ID\",\"purpose\":\"alerts\",\"ttl_hours\":2}"
```

2. Send a test alert email to the leased address.

3. Fetch the latest alert:

```bash
curl -s "$API_BASE/v2/messages?mailbox_id=$MAILBOX_ID&limit=1" \
  -H "authorization: Bearer $ACCESS_TOKEN" \
  -H "x-payment-proof: $PAYMENT_PROOF"
```

4. Send an escalation email:

```bash
curl -s "$API_BASE/v2/messages/send" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $ACCESS_TOKEN" \
  -H "x-payment-proof: $PAYMENT_PROOF" \
  -d "{\"mailbox_id\":\"$MAILBOX_ID\",\"mailbox_password\":\"$MAILBOX_PASSWORD\",\"to\":[\"oncall@example.com\"],\"subject\":\"ALERT: Service degraded\",\"text\":\"Escalating high-severity alert.\"}"
```

5. Release the lease:

```bash
curl -s "$API_BASE/v2/mailboxes/leases/$LEASE_ID/release" \
  -H "authorization: Bearer $ACCESS_TOKEN"
```

## Expected Outcome

- Alert emails are received by the leased inbox.
- Escalation emails are sent successfully.
- Lease is released after completion.
