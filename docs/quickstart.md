# Agent Quickstart (V2 Preview + V1 Auth)

This quickstart gets an agent to a usable inbox in minutes. It uses V1 SIWE auth with the V2 mailbox and message APIs.

## Prerequisites

- API base URL
  - Local: `http://localhost:3000`
  - Production: `https://api.mailagents.net`
- A wallet address for SIWE (V1 auth)
- Payment proof header
  - Dev: `x-payment-proof: mock-proof`
  - Prod: `x-payment-proof: <hmac-proof>`

## Step 0: Set variables

```bash
export API_BASE="https://api.mailagents.net"
export WALLET_ADDRESS="0xabc0000000000000000000000000000000000123"
```

## Step 1: Request SIWE challenge (V1)

```bash
curl -s "$API_BASE/v1/auth/siwe/challenge" \
  -H 'content-type: application/json' \
  -d "{\"wallet_address\":\"$WALLET_ADDRESS\"}"
```

## Step 2: Verify SIWE and get access token (V1)

```bash
curl -s "$API_BASE/v1/auth/siwe/verify" \
  -H 'content-type: application/json' \
  -d '{"message":"<challenge_message>","signature":"<wallet_signature>"}'
```

Store:

- `access_token`
- `agent_id`

## Step 3: Allocate a mailbox lease (V2)

```bash
curl -s "$API_BASE/v2/mailboxes/leases" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer <access_token>" \
  -H 'x-payment-proof: mock-proof' \
  -d '{"agent_id":"<agent_id>","purpose":"signup","ttl_hours":1}'
```

Store:

- `lease_id`
- `mailbox_id`
- `account_id`
- `address`

## Step 4: Receive mail (V2)

```bash
curl -s "$API_BASE/v2/messages?mailbox_id=<mailbox_id>&limit=1" \
  -H "authorization: Bearer <access_token>" \
  -H 'x-payment-proof: mock-proof'
```

## Step 5: Reset mailbox credentials (V2)

```bash
curl -s "$API_BASE/v2/mailboxes/accounts/<account_id>/credentials/reset" \
  -H "authorization: Bearer <access_token>"
```

Store:

- `mailbox_password`

## Step 6: Send mail through the API (V2)

```bash
curl -s "$API_BASE/v2/messages/send" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer <access_token>" \
  -H 'x-payment-proof: mock-proof' \
  -d '{"mailbox_id":"<mailbox_id>","mailbox_password":"<mailbox_password>","to":["receiver@example.com"],"subject":"hello from agent","text":"mail body"}'
```

## Step 7: Release the lease (V2)

```bash
curl -s "$API_BASE/v2/mailboxes/leases/<lease_id>/release" \
  -H "authorization: Bearer <access_token>"
```

## Optional: Webhooks (V2)

```bash
curl -s "$API_BASE/v2/webhooks" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer <access_token>" \
  -H 'x-payment-proof: mock-proof' \
  -d '{"event_types":["message.received"],"target_url":"https://example.com/webhooks/mailagents","secret":"<webhook_secret>"}'
```

## Notes

- For a V1-only flow, see `docs/agent-api-example.md`.
- `mock-proof` is for local development. In production, use the HMAC proof format described in `docs/user-guide.md`.
