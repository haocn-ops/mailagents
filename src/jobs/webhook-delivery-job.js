export const WEBHOOK_DELIVERY_JOB = "webhook.deliver";

export function createWebhookDeliveryJob({ store, webhookDispatcher }) {
  return async function webhookDeliveryJob(payload) {
    const webhook = await store.getWebhook(payload.webhookId);
    if (!webhook) {
      return {
        webhookId: payload.webhookId,
        skipped: true,
        reason: "webhook_not_found",
      };
    }

    const delivery = await webhookDispatcher.dispatch({
      webhook,
      payload: payload.eventPayload,
    });

    await store.recordWebhookDelivery(webhook.id, {
      statusCode: delivery.statusCode,
      requestId: payload.requestId || null,
      metadata: {
        event_type: payload.eventPayload?.event_type || null,
        delivery_id: delivery.deliveryId,
        attempts: delivery.attempts,
        ok: delivery.ok,
        error_message: delivery.errorMessage || null,
        response_excerpt: delivery.responseExcerpt || null,
      },
    });

    return {
      webhookId: webhook.id,
      delivery,
    };
  };
}
