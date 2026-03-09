export function createV1Authz({ requireAuth, evaluateAccess }) {
  return {
    async requireTenant(request, requestId) {
      return requireAuth(request, requestId);
    },

    async requireAccess({
      request,
      requestId,
      tenantId,
      agentId,
      endpoint,
      checkAllocateHourly = false,
    }) {
      return evaluateAccess({
        request,
        requestId,
        tenantId,
        agentId,
        endpoint,
        checkAllocateHourly,
      });
    },
  };
}
