import { parseLatestMessagesQuery, parseMessageId, parseSendMessageBody } from "./validation.js";

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

export function createV1MessageRouteHandler({
  store,
  messageService,
  authz,
  metering,
  responses,
  readJsonBody,
}) {
  return async function handleV1MessageRoute({ method, path, request, requestId, requestUrl }) {
    if (method === "GET" && path === "/v1/messages/latest") {
      const auth = await authz.requireTenant(request, requestId);
      if (!auth.ok) return auth.response;

      const access = await authz.requireAccess({
        request,
        requestId,
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "GET /v1/messages/latest",
      });
      if (!access.ok) return access.response;

      const query = parseLatestMessagesQuery(requestUrl);
      if (!query.ok) {
        return responses.badRequest(requestId, query.message);
      }

      const messages = await messageService.getLatestMessages({
        tenantId: auth.payload.tenant_id,
        mailboxId: query.mailboxId,
        since: query.since,
        limit: query.limit,
      });
      if (messages === null) {
        return responses.notFound(requestId, "Mailbox not found");
      }

      await metering.recordUsage({ auth, endpoint: "GET /v1/messages/latest", requestId, access });
      return responses.okMessages(requestId, messages);
    }

    if (method === "POST" && path === "/v1/messages/send") {
      const auth = await authz.requireTenant(request, requestId);
      if (!auth.ok) return auth.response;

      const access = await authz.requireAccess({
        request,
        requestId,
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v1/messages/send",
      });
      if (!access.ok) return access.response;

      const cooldown = await enforceSendCooldown({
        store,
        tenantId: auth.payload.tenant_id,
        endpoint: "POST /v1/messages/send",
        requestId,
        responses,
      });
      if (cooldown) return cooldown;

      const body = await readJsonBody(request);
      const parsed = parseSendMessageBody(body);
      if (!parsed.ok) {
        return responses.badRequest(requestId, parsed.message);
      }

      let delivery;
      try {
        delivery = await messageService.sendMessage({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          mailboxId: parsed.mailboxId,
          recipients: parsed.recipients,
          subject: parsed.subject,
          text: parsed.text,
          html: parsed.html,
          mailboxPassword: parsed.mailboxPassword,
        });
      } catch (err) {
        return responses.mailBackendError(requestId, err.message || "Mail backend send failed");
      }
      if (!delivery) {
        return responses.notFound(requestId, "Mailbox not found");
      }

      await metering.recordUsage({ auth, endpoint: "POST /v1/messages/send", requestId, access });
      return responses.ok(requestId, delivery);
    }

    if (method === "GET" && path.startsWith("/v1/messages/")) {
      const auth = await authz.requireTenant(request, requestId);
      if (!auth.ok) return auth.response;

      const messageResult = parseMessageId(path);
      if (!messageResult.ok) {
        return responses.badRequest(requestId, messageResult.message);
      }

      const message = await messageService.getMessageDetail(auth.payload.tenant_id, messageResult.messageId);
      if (!message) {
        return responses.notFound(requestId, "Message not found");
      }
      return responses.ok(requestId, message);
    }

    return null;
  };
}
