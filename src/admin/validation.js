export function parseAdminPathParam(path, { prefix, suffix = "", name }) {
  const raw = suffix ? path.slice(prefix.length, -suffix.length) : path.slice(prefix.length);
  const value = decodeURIComponent(raw).trim();
  if (!value) {
    return { ok: false, message: `${name} is required` };
  }
  return { ok: true, value };
}

export function parseAdminBucket(bucket) {
  const value = String(bucket || "hour");
  if (!["minute", "hour", "day"].includes(value)) {
    return { ok: false, message: "bucket must be minute, hour or day" };
  }
  return { ok: true, value };
}

export function parseLimitSettingsPatch(body, defaults) {
  const nextOverage =
    body.overage_charge_usdc === undefined ? defaults.overageChargeUsdc : Number(body.overage_charge_usdc);
  const nextAgentAllocateHourlyLimit =
    body.agent_allocate_hourly_limit === undefined
      ? defaults.agentAllocateHourlyLimit
      : Number(body.agent_allocate_hourly_limit);

  if (!Number.isFinite(nextOverage) || nextOverage < 0) {
    return { ok: false, message: "overage_charge_usdc must be >= 0" };
  }
  if (!Number.isInteger(nextAgentAllocateHourlyLimit) || nextAgentAllocateHourlyLimit < 0) {
    return { ok: false, message: "agent_allocate_hourly_limit must be an integer >= 0" };
  }

  return {
    ok: true,
    overageChargeUsdc: Number(nextOverage.toFixed(6)),
    agentAllocateHourlyLimit: nextAgentAllocateHourlyLimit,
  };
}

export function parseMailboxFreezeBody(body) {
  const reason = String(body.reason || "").trim();
  if (!reason) {
    return { ok: false, message: "reason is required" };
  }
  return { ok: true, reason };
}

export function parseRiskPolicyBody(body) {
  const policyType = String(body.policy_type || "").trim();
  const value = String(body.value || "").trim();
  const action = String(body.action || "").trim();

  if (!policyType || !value || !action) {
    return { ok: false, message: "policy_type, value and action are required" };
  }

  return {
    ok: true,
    policyType,
    value,
    action,
  };
}
