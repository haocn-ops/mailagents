# Mailbox Reconciliation

Mailbox reconciliation compares control-plane mailbox state in `mailagents` with the real mailbox state in the Mailu fork.

## Goal

Detect cases such as:

- control plane says `leased`, but mailbox is missing in Mailu
- control plane says `leased`, but mailbox is disabled in Mailu
- control plane says `available`, but mailbox is still enabled in Mailu

## Current implementation

- detection mode by default
- optional `--repair` mode for the safest mismatch classes

## CLI

```bash
npm run reconcile:mailboxes
npm run reconcile:mailboxes -- --repair
```

Exit behavior:

- `0` no findings
- `2` findings detected
- `1` command failed

## Finding codes

- `backend_missing`
- `status_mismatch`

## Current repair actions

When `--repair` is enabled:

- `leased` + backend missing -> reprovision mailbox on backend
- `leased` + backend disabled -> reprovision mailbox on backend
- `available` + backend enabled -> disable/release mailbox on backend

Repair actions write audit events:

- `mailbox.reconcile_provisioned`
- `mailbox.reconcile_released`

## Next step

Add richer repair policies after the Mailu fork internal APIs are stable enough for mailbox recreation, alias reconciliation, and raw message recovery.
