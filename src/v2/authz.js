export function createV2Authz({ requireAuth, evaluateAccess }) {
  return {
    async requireTenantAuth(request, requestId) {
      return requireAuth(request, requestId);
    },

    async requireTenantAccess({ request, requestId, tenantId, agentId, endpoint, checkAllocateHourly, allocateHourlyEndpoints }) {
      return evaluateAccess({
        request,
        requestId,
        tenantId,
        agentId,
        endpoint,
        checkAllocateHourly,
        allocateHourlyEndpoints,
      });
    },
  };
}
