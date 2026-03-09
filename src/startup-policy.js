import { validateProductionReadiness } from "./preflight.js";

function isTrue(value) {
  return String(value || "").toLowerCase() === "true";
}

export function shouldEnforceStartupPreflight(env = process.env) {
  return (
    isTrue(env.REQUIRE_PROD_PREFLIGHT) ||
    (String(env.NODE_ENV || "").toLowerCase() === "production" && isTrue(env.ENFORCE_SAFE_STARTUP))
  );
}

export function evaluateStartupPreflight(config) {
  const result = validateProductionReadiness(config);
  if (!result.ok) {
    const error = new Error(`Production preflight failed: ${result.errors.join("; ")}`);
    error.code = "PROD_PREFLIGHT_FAILED";
    error.details = result;
    throw error;
  }
  return { ok: true, enforced: true, warnings: result.warnings, errors: [] };
}
