# Agent API Example

This example shows a minimal agent workflow using the public HTTP API only.

## 1. Get SIWE challenge

```bash
curl -s http://localhost:3000/v1/auth/siwe/challenge \
  -H 'content-type: application/json' \
  -d '{"wallet_address":"0xabc0000000000000000000000000000000000123"}'
```

## 2. Verify and get JWT

```bash
curl -s http://localhost:3000/v1/auth/siwe/verify \
  -H 'content-type: application/json' \
  -d '{"message":"<challenge_message>","signature":"<wallet_signature>"}'
```

Store:

- `access_token`
- `agent_id`

## 3. Allocate mailbox

```bash
curl -s http://localhost:3000/v1/mailboxes/allocate \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <access_token>' \
  -H 'x-payment-proof: <proof_for_allocate>' \
  -d '{"agent_id":"<agent_id>","purpose":"agent-workflow","ttl_hours":1}'
```

Store:

- `mailbox_id`
- `address`

## 4. Read latest parsed messages

```bash
curl -s "http://localhost:3000/v1/messages/latest?mailbox_id=<mailbox_id>&limit=10" \
  -H 'authorization: Bearer <access_token>' \
  -H 'x-payment-proof: <proof_for_latest_messages>'
```

## 5. Issue mailbox credentials for send API / Webmail / SMTP

```bash
curl -s http://localhost:3000/v1/mailboxes/credentials/reset \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <access_token>' \
  -d '{"mailbox_id":"<mailbox_id>"}'
```

Store:

- `webmail_password`

## 6. Send mail directly through the HTTP API

```bash
curl -s http://localhost:3000/v1/messages/send \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <access_token>' \
  -H 'x-payment-proof: <proof_for_send>' \
  -d '{"mailbox_id":"<mailbox_id>","to":"receiver@example.com","subject":"agent send api","text":"hello from agent api","mailbox_password":"<webmail_password>"}'
```

The API returns:

- `from`
- `accepted`
- `rejected`
- `message_id`
- `response`

## 7. Release mailbox

```bash
curl -s http://localhost:3000/v1/mailboxes/release \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <access_token>' \
  -d '{"mailbox_id":"<mailbox_id>"}'
```
