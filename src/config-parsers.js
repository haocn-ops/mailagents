export function asLower(value, fallback) {
  return String(value ?? fallback).toLowerCase();
}

export function asUpper(value, fallback) {
  return String(value ?? fallback).toUpperCase();
}

export function asNumber(value, fallback) {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : Number(fallback);
}

export function asBoolean(value, fallback = false) {
  return String(value ?? String(fallback)).toLowerCase() === "true";
}

export function asCsvList(value, fallback = []) {
  const raw = Array.isArray(fallback) ? fallback.join(",") : String(fallback ?? "");
  return String(value ?? raw)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
