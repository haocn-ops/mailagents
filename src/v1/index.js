import { createV1Authz } from "./authz.js";
import { createV1MailboxRouteHandler } from "./mailbox-routes.js";
import { createV1MailboxService } from "../services/v1-mailbox-service.js";
import { createV1MessageRouteHandler } from "./message-routes.js";
import { createV1MessageService } from "../services/v1-message-service.js";
import { createV1Metering } from "./metering.js";
import { createV1Responses } from "./responses.js";
import { createV1WebhookRouteHandler } from "./webhook-routes.js";
import { createV1WebhookService } from "../services/v1-webhook-service.js";

export function createV1RouteHandler({
  store,
  mailBackend,
  requireAuth,
  evaluateAccess,
  jsonResponse,
  readJsonBody,
  getOverageChargeUsdc,
}) {
  const mailboxService = createV1MailboxService({ store, mailBackend });
  const messageService = createV1MessageService({ store, mailBackend });
  const webhookService = createV1WebhookService({ store });
  const authz = createV1Authz({ requireAuth, evaluateAccess });
  const metering = createV1Metering({ store, getOverageChargeUsdc });
  const responses = createV1Responses({ jsonResponse });
  const handleMailboxRoute = createV1MailboxRouteHandler({
    mailboxService,
    authz,
    metering,
    responses,
    readJsonBody,
  });
  const handleMessageRoute = createV1MessageRouteHandler({
    store,
    messageService,
    authz,
    metering,
    responses,
    readJsonBody,
  });
  const handleWebhookRoute = createV1WebhookRouteHandler({
    webhookService,
    authz,
    metering,
    responses,
    readJsonBody,
  });

  return async function handleV1Route({ method, path, request, requestId, requestUrl }) {
    if (!path.startsWith("/v1/")) return null;

    const mailboxResponse = await handleMailboxRoute({ method, path, request, requestId, requestUrl });
    if (mailboxResponse) return mailboxResponse;

    const messageResponse = await handleMessageRoute({ method, path, request, requestId, requestUrl });
    if (messageResponse) return messageResponse;

    const webhookResponse = await handleWebhookRoute({ method, path, request, requestId, requestUrl });
    if (webhookResponse) return webhookResponse;

    return null;
  };
}
