# Public Demo Inbox Runbook

This runbook sets up a public demo inbox with auto-reply using the `scripts/demo-inbox-bot.js` script.

## Prerequisites

- Production API access token
- Agent ID for the demo tenant
- HMAC payment proof support enabled in production

## Environment Variables

```
API_BASE=https://api.mailagents.net
ACCESS_TOKEN=replace-me
AGENT_ID=replace-me
PURPOSE=demo-inbox
TTL_HOURS=1
POLL_INTERVAL_SECONDS=15
IDLE_RELEASE_MINUTES=30
AUTO_REPLY_SUBJECT=Thanks for trying Mailagents
AUTO_REPLY_TEXT=We received your email. This is a demo auto-reply from a leased inbox.
```

## Run Locally

```bash
node scripts/demo-inbox-bot.js
```

## Run in Production

- Option A: Systemd or PM2 on a small VM
- Option B: Cron job that re-starts every hour
- Option C: Managed worker (if Node runtimes are supported)

## Safety Notes

- Limit to a single active lease.
- Use a short TTL and idle timeout.
- Add rate limits at the API edge to prevent abuse.

## Demo Flow

1. Bot allocates a lease.
2. Bot polls for inbound messages.
3. Bot auto-replies to sender.
4. Bot releases the lease after idle timeout.
