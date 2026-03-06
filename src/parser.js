function firstMatch(text, regex) {
  const match = regex.exec(text);
  return match ? match[1] || match[0] : null;
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHtmlLink(html) {
  return firstMatch(String(html || ""), /href=["'](https?:\/\/[^"'<> ]+)["']/i);
}

function extractOtp(source) {
  const patterns = [
    /\bcode[:\s-]*([A-Z0-9]{4,8})\b/i,
    /\botp[:\s-]*([A-Z0-9]{4,8})\b/i,
    /\bverification(?:\s+code)?[:\s-]*([A-Z0-9]{4,8})\b/i,
    /\b([0-9]{4,8})\b/,
  ];
  for (const pattern of patterns) {
    const match = firstMatch(source, pattern);
    if (match) return String(match).toUpperCase();
  }
  return null;
}

export function parseInboundContent({ subject = "", textExcerpt = "", htmlExcerpt = "", htmlBody = "" }) {
  const htmlText = stripHtml(`${htmlExcerpt}\n${htmlBody}`);
  const source = `${subject}\n${textExcerpt}\n${htmlText}`;
  const otpCode = extractOtp(source);
  const verificationLink =
    extractHtmlLink(`${htmlExcerpt}\n${htmlBody}`) ||
    firstMatch(source, /(https?:\/\/[^\s)>"']+)/i);

  return {
    otpCode,
    verificationLink,
    parsed: Boolean(otpCode || verificationLink),
    parserStatus: otpCode || verificationLink ? "parsed" : "failed",
  };
}
