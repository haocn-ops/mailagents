import { createV2WebhookService } from "../services/v2-webhook-service.js";
import { createV2Authz } from "./authz.js";
import { createV2Metering } from "./metering.js";
import { createV2Responses } from "./responses.js";
import { parseRequiredPathParam, parseWebhookCreateBody } from "./validation.js";

export function createV2WebhookRouteHandler({
  store,
  requireAuth,
  evaluateAccess,
  jsonResponse,
  readJsonBody,
  getOverageChargeUsdc,
}) {
  const webhookService = createV2WebhookService({ store });
  const authz = createV2Authz({ requireAuth, evaluateAccess });
  const metering = createV2Metering({ store, getOverageChargeUsdc });
  const responses = createV2Responses({ jsonResponse });

  return async function handleV2WebhookRoute({ method, path, request, requestId, requestUrl }) {
    if (!path.startsWith("/v2/webhooks")) return null;

    if (method === "POST" && path === "/v2/webhooks") {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;
      const access = await authz.requireTenantAccess({
        request,
        requestId,
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v2/webhooks",
      });
      if (!access.ok) return access.response;

      const body = await readJsonBody(request);
      const parsed = parseWebhookCreateBody(body);
      if (!parsed.ok) {
        return responses.badRequest(requestId, parsed.message);
      }

      const webhook = await webhookService.createWebhook({
        tenantId: auth.payload.tenant_id,
        eventTypes: parsed.eventTypes,
        targetUrl: parsed.targetUrl,
        secret: parsed.secret,
      });

      await metering.recordUsageAndCharge({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v2/webhooks",
        requestId,
        access,
      });

      return responses.created(requestId, webhook);
    }

    if (method === "GET" && path === "/v2/webhooks") {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;
      const items = await webhookService.listWebhooks(auth.payload.tenant_id);
      return responses.okItems(requestId, items);
    }

    if (method === "GET" && path.startsWith("/v2/webhooks/deliveries/")) {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const deliveryIdResult = parseRequiredPathParam(path, {
        prefix: "/v2/webhooks/deliveries/",
        name: "delivery_id",
      });
      if (!deliveryIdResult.ok) {
        return responses.badRequest(requestId, deliveryIdResult.error);
      }

      const delivery = await webhookService.getWebhookDelivery({
        tenantId: auth.payload.tenant_id,
        deliveryId: deliveryIdResult.value,
      });
      if (!delivery) {
        return responses.notFound(requestId, "Webhook delivery not found");
      }
      return responses.ok(requestId, delivery);
    }

    if (
      method === "GET" &&
      path.startsWith("/v2/webhooks/") &&
      path !== "/v2/webhooks/deliveries" &&
      !path.startsWith("/v2/webhooks/deliveries/") &&
      !path.endsWith("/rotate-secret")
    ) {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const webhookIdResult = parseRequiredPathParam(path, {
        prefix: "/v2/webhooks/",
        name: "webhook_id",
      });
      if (!webhookIdResult.ok) {
        return responses.badRequest(requestId, webhookIdResult.error);
      }

      const webhook = await webhookService.getWebhook(auth.payload.tenant_id, webhookIdResult.value);
      if (!webhook) {
        return responses.notFound(requestId, "Webhook not found");
      }

      return responses.ok(requestId, webhook);
    }

    if (method === "POST" && path.startsWith("/v2/webhooks/") && path.endsWith("/rotate-secret")) {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const webhookIdResult = parseRequiredPathParam(path, {
        prefix: "/v2/webhooks/",
        suffix: "/rotate-secret",
        name: "webhook_id",
      });
      if (!webhookIdResult.ok) {
        return responses.badRequest(requestId, webhookIdResult.error);
      }
      const webhookId = webhookIdResult.value;
      const rotated = await webhookService.rotateWebhookSecret({
        tenantId: auth.payload.tenant_id,
        webhookId,
        actorDid: auth.payload.did,
        requestId,
      });
      if (!rotated) {
        return responses.notFound(requestId, "Webhook not found");
      }

      return responses.ok(requestId, rotated);
    }

    if (method === "GET" && path === "/v2/webhooks/deliveries") {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const webhookId = requestUrl.searchParams.get("webhook_id");
      const items = await webhookService.listWebhookDeliveries({
        tenantId: auth.payload.tenant_id,
        webhookId,
      });
      return responses.okItems(requestId, items);
    }

    if (method === "GET" && path.startsWith("/v2/webhooks/deliveries/")) {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const deliveryIdResult = parseRequiredPathParam(path, {
        prefix: "/v2/webhooks/deliveries/",
        name: "delivery_id",
      });
      if (!deliveryIdResult.ok) {
        return responses.badRequest(requestId, deliveryIdResult.error);
      }

      const delivery = await webhookService.getWebhookDelivery({
        tenantId: auth.payload.tenant_id,
        deliveryId: deliveryIdResult.value,
      });
      if (!delivery) {
        return responses.notFound(requestId, "Webhook delivery not found");
      }
      return responses.ok(requestId, delivery);
    }

    return null;
  };
}
