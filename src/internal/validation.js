export function parseInternalPathParam(path, { prefix, name }) {
  const value = decodeURIComponent(path.slice(prefix.length)).trim().toLowerCase();
  if (!value) {
    return { ok: false, message: `${name} is required` };
  }
  return { ok: true, value };
}

export function parseInboundEventBody(body) {
  const mailboxAddress = String(body.address || "").trim().toLowerCase();
  const sender = String(body.sender || "").trim().toLowerCase();
  const senderDomain = String(body.sender_domain || "").trim().toLowerCase();
  const subject = String(body.subject || "").trim();
  const providerMessageId = String(body.provider_message_id || "").trim() || null;
  const rawRef = String(body.raw_ref || "").trim() || null;
  const receivedAt = String(body.received_at || "").trim() || new Date().toISOString();
  const textExcerpt = String(body.text_excerpt || "").trim() || null;
  const htmlExcerpt = String(body.html_excerpt || "").trim() || null;
  const htmlBody = String(body.html_body || "").trim() || null;
  const headers = body.headers && typeof body.headers === "object" ? body.headers : {};

  if (!mailboxAddress || !senderDomain) {
    return { ok: false, message: "address and sender_domain are required" };
  }

  return {
    ok: true,
    mailboxAddress,
    sender,
    senderDomain,
    subject,
    providerMessageId,
    rawRef,
    receivedAt,
    textExcerpt,
    htmlExcerpt,
    htmlBody,
    headers,
  };
}

export function parseMailboxCallbackBody(body) {
  const mailboxAddress = String(body.address || "").trim().toLowerCase();
  const providerRef = String(body.provider_ref || "").trim() || null;

  if (!mailboxAddress) {
    return { ok: false, message: "address is required" };
  }

  return {
    ok: true,
    mailboxAddress,
    providerRef,
  };
}
