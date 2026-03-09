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
