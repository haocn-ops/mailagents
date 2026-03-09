import { createV2BillingRouteHandler } from "./billing-routes.js";
import { createV2MailboxRouteHandler } from "./mailbox-routes.js";
import { createV2MessageRouteHandler } from "./message-routes.js";
import { createV2WebhookRouteHandler } from "./webhook-routes.js";

export function createV2RouteHandler(deps) {
  const billingHandler = createV2BillingRouteHandler(deps);
  const mailboxHandler = createV2MailboxRouteHandler(deps);
  const messageHandler = createV2MessageRouteHandler(deps);
  const webhookHandler = createV2WebhookRouteHandler(deps);

  return async function handleV2Route(context) {
    return (
      (await billingHandler(context)) ||
      (await mailboxHandler(context)) ||
      (await messageHandler(context)) ||
      (await webhookHandler(context)) ||
      null
    );
  };
}
