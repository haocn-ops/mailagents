# Mailagents Growth Plan (0 Users -> First 20 Active Agents)

This plan is executable, week-by-week, and optimized for developer-first distribution. It assumes the API is live and the team can ship docs and lightweight product changes quickly.

## Objectives (90 days)

- 10 to 20 active agents using mailbox leases weekly.
- Time-to-first-lease under 5 minutes.
- 3 reference demos that developers can run in 10 minutes.

## North Star Metric

- Weekly active mailbox leases.

## Target Segments

- Agent developers who need real inboxes for signup, verification, or alerts.
- Platform builders who need lease-based mailbox isolation.
- SaaS teams who resell email workflows as APIs.

## Positioning Statements

- Rent inboxes like compute instances.
- Release when done. Pay for time used.
- Agent-native email infrastructure with strong tenant isolation.

## Core Funnel

- Acquire: demos, docs, and developer outreach.
- Activate: copy-paste quickstart that yields a working inbox.
- Retain: webhooks, reliability, and clear lease lifecycle.
- Monetize: free tier with usage-based overage and paid tiers for scale.
- Refer: forkable demo repos and templates.

## Required Assets

- Agent quickstart with V2 lease flow and V1 auth: `docs/quickstart.md`
- Public demo inbox with auto-reply
- 3 demo repos with 10-minute setup
- One-page landing page with value statement
- Pricing page with free tier and paid tiers

## 90-Day Execution Plan

### Weeks 1-2: Activation Foundations

- Ship `docs/quickstart.md` and link it from README and Agents Guide.
- Add a fast-path section to the Agents Guide.
- Publish a public demo inbox that auto-replies to inbound mail.
- Instrument activation events:
  - `auth.complete`, `lease.created`, `message.received`, `message.sent`, `lease.released`

Acceptance criteria:

- New users can reach a working inbox in under 5 minutes.
- A demo address returns a valid auto-reply within 60 seconds.

### Weeks 3-4: Demo Content + Repo Distribution

- Demo 1: SaaS signup/verification agent
- Demo 2: Customer support triage agent
- Demo 3: Alerts + escalation agent
- Each demo includes:
  - README with 10-minute setup
  - `.env.example`
  - A minimal workflow diagram

Acceptance criteria:

- Each demo README can be executed in under 10 minutes by a new developer.
- Demos highlight inbound + outbound usage and release.

### Weeks 5-6: Targeted Outreach

- Identify 50 agent developers from GitHub and forums.
- Reach out to 15 to 20 with personalized demos.
- Offer 1:1 onboarding for the first 10 integrations.
- Capture 3 short case studies.

Acceptance criteria:

- 10 developers complete a full lease workflow.
- At least 3 agree to be quoted or listed.

### Weeks 7-8: Platform Integrations

- Build one integration for a popular agent framework.
- Publish a reference adapter with official sample code.
- Add one-click provisioning support for partner platforms.

Acceptance criteria:

- One partner can provision a mailbox lease without direct API docs.

### Weeks 9-12: Monetization + Retention

- Launch free tier with usage limits.
- Add paid tier for:
  - Custom domain support
  - Higher lease concurrency
  - SLA and priority support
- Publish reliability metrics and delivery SLAs.

Acceptance criteria:

- First 3 paying users or paid pilots.

## Experiments Backlog

- Non-wallet onboarding:
  - Option A: email magic link
  - Option B: temporary API key valid for 30 minutes
- Short-lived demo tenants for hackathons
- Inbox leasing widget for partner platforms

## Success Metrics

- Activation rate: 30% of signups create a lease.
- 7-day retention: 20% of activated users return.
- Time-to-first-lease: under 5 minutes.
- Demo conversion: 5% of demo viewers request access.

## Risks and Mitigations

- SIWE friction for non-web3 users:
  - Mitigation: temporary API key onboarding experiment.
- Confusion between V1 and V2:
  - Mitigation: single quickstart with explicit V2 steps.
- Demo inbox abuse:
  - Mitigation: rate limits, auto-expiry, monitored allowlist.

## Execution Checklist

- [x] Add fast-path Quickstart to Agents Guide UI
- [x] Publish quickstart link in README and docs index
- [x] Create demo README skeletons (3 demos)
- [ ] Ship public demo inbox + auto-reply workflow (runbook + script ready)
- [x] Add non-wallet onboarding spec draft
- [x] Draft outreach list and message templates
- [x] Define pricing page structure

## Weekly Cadence

- Monday: review activation funnel metrics.
- Wednesday: ship one demo or integration update.
- Friday: customer interviews and feedback capture.
