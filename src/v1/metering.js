export function createV1Metering({ store, getOverageChargeUsdc }) {
  return {
    async recordUsage({ auth, endpoint, requestId, access = null }) {
      await store.recordUsage({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint,
        quantity: 1,
        requestId,
      });

      if (access?.requiresCharge) {
        await store.recordOverageCharge({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          endpoint,
          reasons: access.reasons,
          amountUsdc: getOverageChargeUsdc(),
          requestId,
        });
      }
    },
  };
}
