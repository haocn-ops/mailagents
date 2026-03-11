# Non-Wallet Onboarding (Draft Spec)

This draft reduces friction for non-web3 teams by introducing a temporary, scoped API key or magic-link onboarding path. It is intentionally minimal and safe for early growth experiments.

## Goals

- Let new users create their first lease without a wallet.
- Keep the temporary credential short-lived and scoped.
- Preserve SIWE as the long-term auth path.

## Option A: Temporary API Key (Preferred)

### Flow

1. User requests a temporary API key.
2. API returns a `temp_api_key` valid for 30 minutes.
3. Temp key only allows:
   - Create lease
   - Read messages
   - Send messages
   - Release lease
4. After 30 minutes, all calls fail with `401`.

### Proposed Endpoints

```
POST /v1/auth/temp-key
GET /v1/auth/temp-key/status
```

### Example Request

```json
{
  "email": "dev@example.com",
  "company": "Example Labs",
  "purpose": "testing"
}
```

### Example Response

```json
{
  "temp_api_key": "temp_live_xxx",
  "expires_at": "2026-03-11T10:30:00Z",
  "scopes": ["lease:create", "messages:read", "messages:send", "lease:release"]
}
```

### Authorization

```
Authorization: Bearer temp_live_xxx
```

### Safeguards

- Rate limit: 3 temp keys per email per day.
- Max 1 active lease per temp key.
- Enforced `ttl_hours <= 1`.
- Inbox domain allowlist for outbound send.

## Option B: Magic Link

### Flow

1. User requests a magic link.
2. Link opens a minimal session and issues a temporary API key.
3. Same scope and limits as Option A.

### Proposed Endpoints

```
POST /v1/auth/magic-link
POST /v1/auth/magic-link/verify
```

## Metrics to Track

- Temp key issued → lease created conversion
- Lease created → message received conversion
- Lease created → message sent conversion
- Temp key → SIWE upgrade conversion

## Rollout Plan

- Phase 1: internal allowlist
- Phase 2: public beta with daily caps
- Phase 3: full launch with rate limiting
