export function createWebhookDispatcher() {
  return {
    async dispatch({ webhook, payload }) {
      try {
        const response = await fetch(webhook.targetUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        return {
          ok: response.ok,
          statusCode: response.status,
        };
      } catch {
        return {
          ok: false,
          statusCode: 502,
        };
      }
    },
  };
}
