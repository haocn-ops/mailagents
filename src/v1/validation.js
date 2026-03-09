export function parseMailboxActionBody(body, fieldName = "mailbox_id") {
  const mailboxId = String(body[fieldName] || "").trim();
  if (!mailboxId) {
    return { ok: false, message: `${fieldName} is required` };
  }
  return { ok: true, mailboxId };
}

export function parseMailboxAllocateBody(body, expectedAgentId) {
  const purpose = String(body.purpose || "").trim();
  const ttlHours = Number(body.ttl_hours);
  const agentId = String(body.agent_id || "").trim();

  if (!agentId || !purpose || !Number.isFinite(ttlHours)) {
    return { ok: false, status: 400, error: "bad_request", message: "agent_id, purpose, ttl_hours are required" };
  }
  if (expectedAgentId && expectedAgentId !== agentId) {
    return { ok: false, status: 403, error: "forbidden", message: "agent_id does not match token" };
  }
  if (ttlHours < 1 || ttlHours > 720) {
    return { ok: false, status: 400, error: "bad_request", message: "ttl_hours must be 1..720" };
  }

  return {
    ok: true,
    purpose,
    ttlHours,
    agentId,
  };
}

export function parseLatestMessagesQuery(requestUrl) {
  const mailboxId = requestUrl.searchParams.get("mailbox_id");
  const since = requestUrl.searchParams.get("since");
  const limitRaw = requestUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 20;

  if (!mailboxId) {
    return { ok: false, message: "mailbox_id is required" };
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return { ok: false, message: "limit must be 1..100" };
  }

  return { ok: true, mailboxId, since, limit };
}

export function parseSendMessageBody(body) {
  const mailboxId = String(body.mailbox_id || "").trim();
  const recipients = Array.isArray(body.to)
    ? body.to.map((item) => String(item || "").trim()).filter(Boolean)
    : String(body.to || "").trim()
      ? [String(body.to || "").trim()]
      : [];
  const subject = String(body.subject || "").trim();
  const text = String(body.text || "");
  const html = String(body.html || "");
  const mailboxPassword = String(body.mailbox_password || "").trim();

  if (!mailboxId || !recipients.length || !subject || !mailboxPassword || (!text && !html)) {
    return {
      ok: false,
      message: "mailbox_id, to, subject, mailbox_password, and text or html are required",
    };
  }

  return {
    ok: true,
    mailboxId,
    recipients,
    subject,
    text,
    html,
    mailboxPassword,
  };
}

export function parseWebhookBody(body) {
  const eventTypes = Array.isArray(body.event_types) ? body.event_types : null;
  const targetUrl = String(body.target_url || "").trim();
  const secret = String(body.secret || "");

  if (!eventTypes || !targetUrl || !secret) {
    return { ok: false, message: "event_types, target_url, secret are required" };
  }
  if (secret.length < 16) {
    return { ok: false, message: "secret must have at least 16 chars" };
  }

  const allowedEvents = new Set(["mail.received", "otp.extracted"]);
  if (eventTypes.some((eventType) => !allowedEvents.has(eventType))) {
    return { ok: false, message: "event_types contains unsupported values" };
  }

  return { ok: true, eventTypes, targetUrl, secret };
}

export function parseInvoiceId(path) {
  const invoiceId = path.replace("/v1/billing/invoices/", "").trim();
  if (!invoiceId) {
    return { ok: false, message: "invoice_id is required" };
  }
  return { ok: true, invoiceId };
}

export function parseMessageId(path) {
  const messageId = path.replace("/v1/messages/", "").trim();
  if (!messageId) {
    return { ok: false, message: "message_id is required" };
  }
  return { ok: true, messageId };
}
