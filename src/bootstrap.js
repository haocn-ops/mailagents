import { evaluateStartupPreflight, shouldEnforceStartupPreflight } from "./startup-policy.js";

export function runStartupPreflight(config, env = process.env) {
  if (!shouldEnforceStartupPreflight(env)) {
    return { ok: true, enforced: false, warnings: [], errors: [] };
  }
  return evaluateStartupPreflight(config);
}
