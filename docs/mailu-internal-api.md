# Mailu Internal API Contract

This document defines the first internal contract between the self-hosted Mailu fork and `mailagents`.

It is an internal integration surface, not a customer-facing API.

## Authentication

- Use `Authorization: Bearer <INTERNAL_API_TOKEN>`
- `INTERNAL_API_TOKEN` must be configured on the `mailagents` side
- Mailu fork should keep the same shared token in its internal integration config

## 1. Inbound Event Ingestion

### Endpoint

`POST /internal/inbound/events`

### Purpose

Used by the Mailu fork to notify `mailagents` that a real inbound message has been accepted and stored.

### Request body

```json
{
  "address": "abc000-1@inbox.mailagents.net",
  "provider_message_id": "mailu-msg-123",
  "sender": "noreply@example.com",
  "sender_domain": "example.com",
  "subject": "Your verification code",
  "received_at": "2026-03-06T06:30:00.000Z",
  "raw_ref": "mailu://mailstore/msg-123",
  "text_excerpt": "Your verification code is 123456",
  "headers": {
    "message-id": "<abc@example.com>"
  }
}
```

### Required fields

- `address`
- `sender_domain`

### Response

`202 Accepted`

```json
{
  "status": "accepted",
  "tenant_id": "uuid",
  "mailbox_id": "uuid",
  "message_id": "uuid"
}
```

### Failure modes

- `401` invalid or missing internal token
- `404` mailbox address not found in control plane
- `400` malformed request

## 2. Planned next internal endpoints

- `POST /internal/mailboxes/provision`
- `POST /internal/mailboxes/release`

### `POST /internal/mailboxes/provision`

Used by the Mailu fork to confirm that a mailbox has been provisioned on the mail data plane.

Example body:

```json
{
  "address": "abc000-1@inbox.mailagents.net",
  "provider_ref": "{\"kind\":\"mailu-user\",\"email\":\"abc000-1@inbox.mailagents.net\"}"
}
```

Response:

```json
{
  "status": "accepted",
  "tenant_id": "uuid",
  "mailbox_id": "uuid",
  "provider_ref": "..."
}
```

### `POST /internal/mailboxes/release`

Used by the Mailu fork to confirm that a mailbox has been disabled or deleted on the mail data plane.

Example body:

```json
{
  "address": "abc000-1@inbox.mailagents.net",
  "provider_ref": "{\"kind\":\"mailu-user\",\"email\":\"abc000-1@inbox.mailagents.net\"}"
}
```

Response shape is the same as provision.

### Planned next internal endpoints

- `GET /internal/mailboxes/{address}`
- `GET /internal/messages/{message_id}`

## 3. Mapping rules

- `address` must match an existing control-plane mailbox record
- `raw_ref` points to the raw message in Mailu storage
- `provider_message_id` is Mailu-side message identity
- `headers` and `text_excerpt` are preserved in `message_events.payload`

## 4. Processing rules

- Each accepted inbound event creates a `messages` row
- Each accepted inbound event creates a `message_events` row with `event_type = "mail.received"`
- Each accepted inbound event creates an `audit_logs` entry with action `message.ingest`
