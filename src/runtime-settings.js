export function createRuntimeSettingsManager({
  store,
  overageChargeUsdc,
  agentAllocateHourlyLimit,
}) {
  const runtimeSettings = {
    overageChargeUsdc: Number(overageChargeUsdc || 0.001),
    agentAllocateHourlyLimit: Number(agentAllocateHourlyLimit || 0),
  };
  let runtimeSettingsLoaded = false;

  return {
    getOverageChargeUsdc() {
      return Number(runtimeSettings.overageChargeUsdc || 0);
    },

    getAgentAllocateHourlyLimit() {
      return Number(runtimeSettings.agentAllocateHourlyLimit || 0);
    },

    async ensureLoaded() {
      if (runtimeSettingsLoaded) return;
      if (typeof store.getRuntimeSettings !== "function") return;
      const persisted = await store.getRuntimeSettings();
      if (persisted?.overage_charge_usdc != null) {
        runtimeSettings.overageChargeUsdc = Number(persisted.overage_charge_usdc);
      }
      if (persisted?.agent_allocate_hourly_limit != null) {
        runtimeSettings.agentAllocateHourlyLimit = Number(persisted.agent_allocate_hourly_limit);
      }
      runtimeSettingsLoaded = true;
    },

    async update({ overageChargeUsdc: nextOverageChargeUsdc, agentAllocateHourlyLimit: nextAllocateLimit }) {
      runtimeSettings.overageChargeUsdc = Number(nextOverageChargeUsdc);
      runtimeSettings.agentAllocateHourlyLimit = Number(nextAllocateLimit);
      if (typeof store.updateRuntimeSettings === "function") {
        await store.updateRuntimeSettings({
          overage_charge_usdc: runtimeSettings.overageChargeUsdc,
          agent_allocate_hourly_limit: runtimeSettings.agentAllocateHourlyLimit,
        });
      }
    },
  };
}
