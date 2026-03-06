function firstMatch(text, regex) {
  const match = regex.exec(text);
  return match ? match[1] || match[0] : null;
}

export function parseInboundContent({ subject = "", textExcerpt = "" }) {
  const source = `${subject}\n${textExcerpt}`;
  const otpCode = firstMatch(source, /\b(\d{4,8})\b/);
  const verificationLink = firstMatch(source, /(https?:\/\/[^\s)>"']+)/i);

  return {
    otpCode,
    verificationLink,
    parsed: Boolean(otpCode || verificationLink),
  };
}
