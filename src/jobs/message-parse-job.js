import { parseInboundContent } from "../parser.js";
import { WEBHOOK_DELIVERY_JOB } from "./webhook-delivery-job.js";

export const MESSAGE_PARSE_JOB = "message.parse";

export function createMessageParseJob({ store, queue }) {
  return async function messageParseJob(payload) {
    const parsed = parseInboundContent({
      subject: payload.subject,
      textExcerpt: payload.textExcerpt,
      htmlExcerpt: payload.htmlExcerpt,
      htmlBody: payload.htmlBody,
    });

    await store.applyMessageParseResult({
      messageId: payload.messageId,
      otpCode: parsed.otpCode,
      verificationLink: parsed.verificationLink,
      payload: {
        parser: "builtin",
        source: payload.source || "mailu-internal-event",
        parser_status: parsed.parserStatus,
      },
      requestId: payload.requestId || null,
    });

    const eventType = parsed.parsed ? "otp.extracted" : "mail.received";
    const message = await store.getMessage(payload.messageId);
    if (!message) {
      return {
        messageId: payload.messageId,
        eventType,
        parsed: parsed.parsed,
        skipped: true,
        reason: "message_not_found",
        deliveryJobs: [],
      };
    }

    const webhooks = await store.listActiveWebhooksByEvent(payload.tenantId, eventType);
    const deliveryJobs = [];

    for (const webhook of webhooks) {
      const job = await queue.enqueue(WEBHOOK_DELIVERY_JOB, {
        webhookId: webhook.id,
        requestId: payload.requestId || null,
        eventPayload: {
          event_type: eventType,
          tenant_id: payload.tenantId,
          mailbox_id: payload.mailboxId,
          message_id: payload.messageId,
          sender: payload.sender,
          sender_domain: payload.senderDomain,
          subject: payload.subject,
          received_at: payload.receivedAt,
          otp_code: parsed.otpCode,
          verification_link: parsed.verificationLink,
          message,
        },
      });
      deliveryJobs.push({
        webhookId: webhook.id,
        jobId: job.id,
        status: job.status,
      });
    }

    return {
      messageId: payload.messageId,
      eventType,
      parsed: parsed.parsed,
      deliveryJobs,
    };
  };
}
