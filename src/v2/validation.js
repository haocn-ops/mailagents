export function parseRequiredPathParam(path, { prefix, suffix = "", name }) {
  const raw = suffix ? path.slice(prefix.length, -suffix.length) : path.slice(prefix.length);
  const value = raw.trim();
  if (!value) {
    return { ok: false, error: `${name} is required` };
  }
  return { ok: true, value };
}

export function parseIntegerInRange(rawValue, { name, min, max, defaultValue = null }) {
  const value = rawValue == null || rawValue === "" ? defaultValue : Number(rawValue);
  if (!Number.isInteger(value) || value < min || value > max) {
    return { ok: false, error: `${name} must be ${min}..${max}` };
  }
  return { ok: true, value };
}

export function parseRecipients(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue.map((item) => String(item || "").trim()).filter(Boolean);
  }

  const single = String(rawValue || "").trim();
  return single ? [single] : [];
}

export function parseLeaseCreateBody(body, expectedAgentId) {
  const purpose = String(body.purpose || "").trim();
  const ttlHoursResult = parseIntegerInRange(body.ttl_hours, { name: "ttl_hours", min: 1, max: 720 });
  const agentId = String(body.agent_id || "").trim();

  if (!agentId || !purpose || body.ttl_hours == null || body.ttl_hours === "") {
    return { ok: false, status: 400, error: "bad_request", message: "agent_id, purpose, ttl_hours are required" };
  }
  if (!ttlHoursResult.ok) {
    return { ok: false, status: 400, error: "bad_request", message: ttlHoursResult.error };
  }
  if (expectedAgentId && expectedAgentId !== agentId) {
    return { ok: false, status: 403, error: "forbidden", message: "agent_id does not match token" };
  }

  return {
    ok: true,
    agentId,
    purpose,
    ttlHours: ttlHoursResult.value,
  };
}

export function parseMessageListQuery(requestUrl) {
  const mailboxId = requestUrl.searchParams.get("mailbox_id");
  const since = requestUrl.searchParams.get("since");
  const limitResult = parseIntegerInRange(requestUrl.searchParams.get("limit"), {
    name: "limit",
    min: 1,
    max: 100,
    defaultValue: 20,
  });

  if (!mailboxId) {
    return { ok: false, message: "mailbox_id is required" };
  }
  if (!limitResult.ok) {
    return { ok: false, message: limitResult.error };
  }

  return {
    ok: true,
    mailboxId,
    since,
    limit: limitResult.value,
  };
}

export function parseSendMessageBody(body) {
  const mailboxId = String(body.mailbox_id || "").trim();
  const recipients = parseRecipients(body.to);
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

export function parseWebhookCreateBody(body) {
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

  return {
    ok: true,
    eventTypes,
    targetUrl,
    secret,
  };
}
