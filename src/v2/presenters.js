export function toV2MailboxAccount(mailbox, lease = null) {
  return {
    account_id: mailbox.mailbox_id,
    mailbox_id: mailbox.mailbox_id,
    address: mailbox.address,
    account_status: mailbox.status === "leased" ? "active" : mailbox.status,
    lease_status: lease?.status || null,
    lease_id: lease?.id || null,
    lease_expires_at: mailbox.lease_expires_at || lease?.expiresAt || null,
    provider_ref: mailbox.provider_ref || null,
    updated_at: mailbox.updated_at || null,
  };
}

export function toV2MailboxLease(mailbox, lease) {
  return {
    lease_id: lease.id,
    mailbox_id: mailbox.mailbox_id,
    account_id: mailbox.mailbox_id,
    address: mailbox.address,
    agent_id: lease.agentId,
    purpose: lease.purpose,
    lease_status: lease.status,
    started_at: lease.startedAt,
    expires_at: lease.expiresAt,
    released_at: lease.releasedAt || null,
  };
}

export function toV2Message(message) {
  const parsedStatus = message.parsed_status || (message.otp_code || message.verification_link ? "parsed" : "pending");
  return {
    message_id: message.message_id,
    mailbox_id: message.mailbox_id,
    sender: message.sender,
    sender_domain: message.sender_domain,
    subject: message.subject,
    raw_ref: message.raw_ref || null,
    received_at: message.received_at,
    otp_code: message.otp_code || null,
    verification_link: message.verification_link || null,
    parsed_status: parsedStatus,
  };
}

export function toV2Invoice(invoice) {
  return {
    invoice_id: invoice.id,
    tenant_id: invoice.tenantId,
    period_start: invoice.periodStart,
    period_end: invoice.periodEnd,
    amount_usdc: invoice.amountUsdc,
    status: invoice.status,
    statement_hash: invoice.statementHash,
    settlement_tx_hash: invoice.settlementTxHash,
  };
}

export function toV2AllocatedLease({ lease, mailbox, provider }) {
  return {
    lease_id: lease.id,
    mailbox_id: mailbox.id,
    account_id: mailbox.id,
    address: mailbox.address,
    lease_status: lease.status,
    expires_at: lease.expiresAt,
    webmail_login: provider?.credentials?.login || null,
    webmail_password: provider?.credentials?.password || null,
    webmail_url: provider?.credentials?.webmailUrl || null,
  };
}

export function toV2ReleasedLease({ leaseId, mailboxId, leaseStatus = "released" }) {
  return {
    lease_id: leaseId,
    mailbox_id: mailboxId,
    lease_status: leaseStatus,
  };
}

export function toV2MailboxCredentials({ mailbox, credentials }) {
  return {
    account_id: mailbox.id,
    mailbox_id: mailbox.id,
    address: mailbox.address,
    webmail_login: credentials?.login || mailbox.address,
    webmail_password: credentials?.password || null,
    webmail_url: credentials?.webmailUrl || null,
  };
}

export function toV2SendResult({ attemptId, completedAttempt }) {
  return {
    send_attempt_id: completedAttempt?.send_attempt_id || attemptId,
    submission_status: completedAttempt?.submission_status || "accepted",
    accepted: completedAttempt?.accepted || [],
    rejected: completedAttempt?.rejected || [],
    message_id: completedAttempt?.message_id || null,
    response: completedAttempt?.response || null,
  };
}

export function toV2Webhook(webhook) {
  return {
    webhook_id: webhook.id,
    event_types: webhook.eventTypes,
    target_url: webhook.targetUrl,
    status: webhook.status,
  };
}
