export function createV2Metering({ store, getOverageChargeUsdc }) {
  return {
    async recordUsage({ tenantId, agentId, endpoint, requestId }) {
      await store.recordUsage({
        tenantId,
        agentId,
        endpoint,
        quantity: 1,
        requestId,
      });
    },

    async recordUsageAndCharge({ tenantId, agentId, endpoint, requestId, access }) {
      await store.recordUsage({
        tenantId,
        agentId,
        endpoint,
        quantity: 1,
        requestId,
      });

      if (!access?.requiresCharge) return;

      await store.recordOverageCharge({
        tenantId,
        agentId,
        endpoint,
        reasons: access.reasons,
        amountUsdc: getOverageChargeUsdc(),
        requestId,
      });
    },
  };
}
