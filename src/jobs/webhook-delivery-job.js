import { createInternalRepository } from "../internal/repository.js";

export const WEBHOOK_DELIVERY_JOB = "webhook.deliver";

export function createWebhookDeliveryJob({
  store,
  webhookDispatcher,
  repository = createInternalRepository({ store }),
}) {
  return async function webhookDeliveryJob(payload) {
    const webhook = await repository.getWebhook(payload.webhookId);
    if (!webhook) {
      return {
        webhookId: payload.webhookId,
        skipped: true,
        reason: "webhook_not_found",
      };
    }

    let delivery;
    try {
      delivery = await webhookDispatcher.dispatch({
        webhook,
        payload: payload.eventPayload,
      });
    } catch (err) {
      await repository.recordWebhookDelivery(webhook.id, {
        statusCode: null,
        requestId: payload.requestId || null,
        metadata: {
          event_type: payload.eventPayload?.event_type || null,
          resource_id: payload.eventPayload?.message_id || payload.eventPayload?.mailbox_id || webhook.id,
          delivery_id: null,
          attempts: 1,
          ok: false,
          error_message: err?.message || String(err),
          response_excerpt: null,
        },
      });
      throw err;
    }

    await repository.recordWebhookDelivery(webhook.id, {
      statusCode: delivery.statusCode,
      requestId: payload.requestId || null,
      metadata: {
        event_type: payload.eventPayload?.event_type || null,
        resource_id: payload.eventPayload?.message_id || payload.eventPayload?.mailbox_id || webhook.id,
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
