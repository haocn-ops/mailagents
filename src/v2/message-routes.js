import { createV2MessageService } from "../services/v2-message-service.js";
import { createV2Authz } from "./authz.js";
import { createV2Metering } from "./metering.js";
import { createV2Responses } from "./responses.js";
import { parseMessageListQuery, parseRequiredPathParam, parseSendMessageBody } from "./validation.js";

const COOLDOWN_WINDOW_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_SEND_LIMIT = 10;

async function enforceSendCooldown({ store, tenantId, endpoint, requestId, responses }) {
  if (!store) return null;
  if (typeof store.getTenantCreatedAt !== "function") return null;
  if (typeof store.hasPrimaryWalletIdentity !== "function") return null;
  if (typeof store.countTenantEndpointUsageSince !== "function") return null;

  const [createdAtRaw, walletBound] = await Promise.all([
    store.getTenantCreatedAt(tenantId),
    store.hasPrimaryWalletIdentity(tenantId),
  ]);

  if (walletBound) return null;
  if (!createdAtRaw) return null;

  const createdAtMs = new Date(createdAtRaw).getTime();
  if (!Number.isFinite(createdAtMs)) return null;
  if (Date.now() - createdAtMs > COOLDOWN_WINDOW_MS) return null;

  const sentCount = await store.countTenantEndpointUsageSince(
    tenantId,
    endpoint,
    new Date(createdAtMs),
  );
  if (sentCount < COOLDOWN_SEND_LIMIT) return null;

  return responses.rateLimited(
    requestId,
    "cooldown_limit",
    "新帳號 24 小時內最多發送 10 封，請先綁定錢包以解除限制。",
    {
      limit: COOLDOWN_SEND_LIMIT,
      window: "24h",
      action: "bind_wallet",
    },
  );
}

export function createV2MessageRouteHandler({
  store,
  mailBackend,
  requireAuth,
  evaluateAccess,
  jsonResponse,
  readJsonBody,
  getOverageChargeUsdc,
}) {
  const messageService = createV2MessageService({ store, mailBackend });
  const authz = createV2Authz({ requireAuth, evaluateAccess });
  const metering = createV2Metering({ store, getOverageChargeUsdc });
  const responses = createV2Responses({ jsonResponse });

  return async function handleV2MessageRoute({ method, path, request, requestId, requestUrl }) {
    if (!path.startsWith("/v2/messages") && !path.startsWith("/v2/send-attempts")) return null;

    if (method === "GET" && path === "/v2/messages") {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;
      const access = await authz.requireTenantAccess({
        request,
        requestId,
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "GET /v2/messages",
      });
      if (!access.ok) return access.response;

      const parsed = parseMessageListQuery(requestUrl);
      if (!parsed.ok) {
        return responses.badRequest(requestId, parsed.message);
      }

      const messages = await messageService.listMessages({
        tenantId: auth.payload.tenant_id,
        mailboxId: parsed.mailboxId,
        since: parsed.since,
        limit: parsed.limit,
      });
      if (messages === null) {
        return responses.notFound(requestId, "Mailbox not found");
      }

      await metering.recordUsageAndCharge({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "GET /v2/messages",
        requestId,
        access,
      });

      return responses.okItems(requestId, messages);
    }

    if (method === "POST" && path === "/v2/messages/send") {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;
      const access = await authz.requireTenantAccess({
        request,
        requestId,
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v2/messages/send",
      });
      if (!access.ok) return access.response;

      const cooldown = await enforceSendCooldown({
        store,
        tenantId: auth.payload.tenant_id,
        endpoint: "POST /v2/messages/send",
        requestId,
        responses,
      });
      if (cooldown) return cooldown;

      const body = await readJsonBody(request);
      const parsed = parseSendMessageBody(body);
      if (!parsed.ok) {
        return responses.badRequest(requestId, parsed.message);
      }

      try {
        const result = await messageService.sendMessage({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          mailboxId: parsed.mailboxId,
          mailboxPassword: parsed.mailboxPassword,
          recipients: parsed.recipients,
          subject: parsed.subject,
          text: parsed.text,
          html: parsed.html,
          requestId,
        });
        if (!result) {
          return responses.notFound(requestId, "Mailbox not found");
        }

        await metering.recordUsageAndCharge({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          endpoint: "POST /v2/messages/send",
          requestId,
          access,
        });

        return responses.accepted(requestId, result);
      } catch (err) {
        if (err.sendAttemptId) {
          return responses.mailBackendError(requestId, err.message || "Mail backend send failed", {
            send_attempt_id: err.sendAttemptId,
          });
        }
        if (err.message === "Mailbox not found") {
          return responses.notFound(requestId, "Mailbox not found");
        }
        return responses.mailBackendError(requestId, err.message || "Mail backend send failed");
      }
    }

    if (method === "GET" && path === "/v2/send-attempts") {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;
      const items = await messageService.listSendAttempts(auth.payload.tenant_id);
      return responses.okItems(requestId, items);
    }

    if (method === "GET" && path.startsWith("/v2/send-attempts/")) {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const sendAttemptIdResult = parseRequiredPathParam(path, {
        prefix: "/v2/send-attempts/",
        name: "send_attempt_id",
      });
      if (!sendAttemptIdResult.ok) {
        return responses.badRequest(requestId, sendAttemptIdResult.error);
      }
      const sendAttemptId = sendAttemptIdResult.value;

      const sendAttempt = await messageService.getSendAttempt(auth.payload.tenant_id, sendAttemptId);
      if (!sendAttempt) {
        return responses.notFound(requestId, "Send attempt not found");
      }
      return responses.ok(requestId, sendAttempt);
    }

    if (method === "GET" && path.startsWith("/v2/messages/")) {
      const auth = await authz.requireTenantAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const messageIdResult = parseRequiredPathParam(path, {
        prefix: "/v2/messages/",
        name: "message_id",
      });
      if (!messageIdResult.ok) {
        return responses.badRequest(requestId, messageIdResult.error);
      }
      const messageId = messageIdResult.value;

      const message = await messageService.getMessage(auth.payload.tenant_id, messageId);
      if (!message) {
        return responses.notFound(requestId, "Message not found");
      }
      return responses.ok(requestId, message);
    }

    return null;
  };
}
