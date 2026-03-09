import test from "node:test";
import assert from "node:assert/strict";
import { createWebhookDeliveryJob } from "../../src/jobs/webhook-delivery-job.js";

test("webhook delivery job dispatches webhook and records delivery", async () => {
  let recorded = null;
  const store = {
    async getWebhook(webhookId) {
      assert.equal(webhookId, "webhook-1");
      return {
        id: "webhook-1",
        targetUrl: "https://example.com/hook",
        secretEnc: "secret",
      };
    },
    async recordWebhookDelivery(webhookId, payload) {
      recorded = { webhookId, payload };
    },
  };
  const webhookDispatcher = {
    async dispatch({ webhook, payload }) {
      assert.equal(webhook.id, "webhook-1");
      assert.equal(payload.event_type, "otp.extracted");
      return { ok: true, statusCode: 200, attempts: 1, deliveryId: "delivery-1" };
    },
  };

  const job = createWebhookDeliveryJob({ store, webhookDispatcher });
  const result = await job({
    webhookId: "webhook-1",
    requestId: "req-1",
    eventPayload: { event_type: "otp.extracted", message_id: "message-1" },
  });

  assert.equal(result.webhookId, "webhook-1");
  assert.equal(result.delivery.statusCode, 200);
  assert.equal(recorded.webhookId, "webhook-1");
  assert.equal(recorded.payload.statusCode, 200);
});

test("webhook delivery job records failure context", async () => {
  let recorded = null;
  const store = {
    async getWebhook() {
      return {
        id: "webhook-2",
        targetUrl: "https://example.com/hook",
      };
    },
    async recordWebhookDelivery(webhookId, payload) {
      recorded = { webhookId, payload };
    },
  };
  const webhookDispatcher = {
    async dispatch() {
      return {
        ok: false,
        statusCode: 503,
        attempts: 3,
        deliveryId: "delivery-2",
        errorMessage: "Webhook returned HTTP 503",
        responseExcerpt: "upstream down",
      };
    },
  };

  const job = createWebhookDeliveryJob({ store, webhookDispatcher });
  const result = await job({
    webhookId: "webhook-2",
    requestId: "req-2",
    eventPayload: { event_type: "mail.received", message_id: "message-2" },
  });

  assert.equal(result.webhookId, "webhook-2");
  assert.equal(result.delivery.ok, false);
  assert.equal(recorded.payload.metadata.error_message, "Webhook returned HTTP 503");
  assert.equal(recorded.payload.metadata.response_excerpt, "upstream down");
});
