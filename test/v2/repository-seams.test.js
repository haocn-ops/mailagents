import test from "node:test";
import assert from "node:assert/strict";

import { createV2TenantReadModels } from "../../src/v2/tenant-read-models.js";
import { createV2TenantCommands } from "../../src/v2/tenant-commands.js";
import { createV2WebhookReadModels } from "../../src/v2/webhook-read-models.js";
import { createV2WebhookCommands } from "../../src/v2/webhook-commands.js";
import { createV2BillingReadModels } from "../../src/v2/billing-read-models.js";

test("v2 tenant read models can run against injected mailbox and message repositories", async () => {
  const calls = [];
  const readModels = createV2TenantReadModels({
    store: {},
    mailboxRepository: {
      async getTenantLeaseById(tenantId, leaseId) {
        calls.push(["lease", tenantId, leaseId]);
        return { id: leaseId, mailboxId: "mb-1", purpose: "otp", expiresAt: "2026-03-10T01:00:00Z" };
      },
      async getTenantMailbox(tenantId, mailboxId) {
        calls.push(["mailbox", tenantId, mailboxId]);
        return { id: mailboxId, address: "a@example.com" };
      },
    },
    messageRepository: {
      async getTenantMessageDetail(tenantId, messageId) {
        calls.push(["message", tenantId, messageId]);
        return {
          message_id: messageId,
          mailbox_id: "mb-1",
          subject: "Code 123456",
          parsed_status: "parsed",
          otp_code: "123456",
          verification_link: null,
          received_at: "2026-03-10T00:00:00Z",
          created_at: "2026-03-10T00:00:00Z",
        };
      },
    },
  });

  const lease = await readModels.getMailboxLease("tenant-1", "lease-1");
  const message = await readModels.getMessage("tenant-1", "msg-1");

  assert.equal(lease.lease_id, "lease-1");
  assert.equal(lease.address, "a@example.com");
  assert.equal(message.message_id, "msg-1");
  assert.equal(message.otp_code, "123456");
  assert.deepEqual(calls, [
    ["lease", "tenant-1", "lease-1"],
    ["mailbox", "tenant-1", "mb-1"],
    ["message", "tenant-1", "msg-1"],
  ]);
});

test("v2 tenant commands can run against injected repositories", async () => {
  const calls = [];
  const commands = createV2TenantCommands({
    store: {},
    mailBackend: {
      async issueMailboxCredentials(args) {
        calls.push(["credentials", args]);
        return { login: args.address, password: "secret" };
      },
      async sendMailboxMessage(args) {
        calls.push(["send", args]);
        return {
          accepted: args.to,
          rejected: [],
          messageId: "smtp-1",
          response: "250 ok",
        };
      },
    },
    mailboxRepository: {
      async getTenantMailbox(tenantId, mailboxId) {
        calls.push(["mailbox", tenantId, mailboxId]);
        return { id: mailboxId, address: "box@example.com", providerRef: "provider-1" };
      },
    },
    messageRepository: {
      async getTenantMailbox(tenantId, mailboxId) {
        calls.push(["send-mailbox", tenantId, mailboxId]);
        return { id: mailboxId, address: "box@example.com" };
      },
      async createSendAttempt(args) {
        calls.push(["create-attempt", args]);
        return { send_attempt_id: "sa-1" };
      },
      async completeSendAttempt(sendAttemptId, delivery) {
        calls.push(["complete-attempt", sendAttemptId, delivery]);
      },
      async getTenantSendAttempt(tenantId, sendAttemptId) {
        calls.push(["get-attempt", tenantId, sendAttemptId]);
        return {
          send_attempt_id: sendAttemptId,
          mailbox_id: "mb-1",
          submission_status: "sent",
          accepted: ["a@example.com"],
          rejected: [],
          message_id: "smtp-1",
          response: "250 ok",
          created_at: "2026-03-10T00:00:00Z",
          updated_at: "2026-03-10T00:00:01Z",
        };
      },
    },
  });

  const credentials = await commands.resetMailboxCredentials({
    tenantId: "tenant-1",
    agentId: "agent-1",
    accountId: "mb-1",
  });
  const sendResult = await commands.sendMessage({
    tenantId: "tenant-1",
    agentId: "agent-1",
    mailboxId: "mb-1",
    mailboxPassword: "secret",
    recipients: ["a@example.com"],
    subject: "Hello",
    text: "body",
    html: "<p>body</p>",
    requestId: "req-1",
  });

  assert.equal(credentials.address, "box@example.com");
  assert.equal(credentials.webmail_password, "secret");
  assert.equal(sendResult.send_attempt_id, "sa-1");
  assert.equal(sendResult.submission_status, "sent");
});

test("v2 webhook read models and commands can run against injected repositories", async () => {
  const calls = [];
  const repository = {
    async listTenantWebhookDeliveries(tenantId, { webhookId }) {
      calls.push(["list-deliveries", tenantId, webhookId]);
      return [{
        delivery_id: "wd-1",
        webhook_id: webhookId,
        attempts: 1,
        ok: true,
        status_code: 200,
        delivered_at: "2026-03-10T00:00:00Z",
      }];
    },
    async getTenantWebhook(tenantId, webhookId) {
      calls.push(["get-webhook", tenantId, webhookId]);
      return {
        webhook_id: webhookId,
        tenant_id: tenantId,
        target_url: "https://example.com/webhook",
        event_types: ["message.received"],
        created_at: "2026-03-10T00:00:00Z",
      };
    },
    async rotateTenantWebhookSecret(tenantId, webhookId, context) {
      calls.push(["rotate", tenantId, webhookId, context]);
      return { webhook_id: webhookId, rotated_at: "2026-03-10T00:10:00Z" };
    },
  };
  const readModels = createV2WebhookReadModels({ store: {}, repository });
  const commands = createV2WebhookCommands({ store: {}, repository });

  const deliveries = await readModels.listWebhookDeliveries({ tenantId: "tenant-1", webhookId: "wh-1" });
  const rotated = await commands.rotateWebhookSecret({
    tenantId: "tenant-1",
    webhookId: "wh-1",
    actorDid: "did:example:admin",
    requestId: "req-1",
  });

  assert.equal(deliveries[0].delivery_id, "wd-1");
  assert.equal(rotated.webhook_id, "wh-1");
  assert.deepEqual(calls, [
    ["list-deliveries", "tenant-1", "wh-1"],
    ["get-webhook", "tenant-1", "wh-1"],
    ["rotate", "tenant-1", "wh-1", { actorDid: "did:example:admin", requestId: "req-1" }],
  ]);
});

test("v2 billing read models can run against injected repository seam", async () => {
  const calls = [];
  const readModels = createV2BillingReadModels({
    store: {},
    repository: {
      async usageSummary(tenantId, start, end) {
        calls.push(["summary", tenantId, start, end]);
        return { api_calls: 2, active_mailboxes: 1, message_parses: 3, billable_units: 6 };
      },
      async getInvoice(invoiceId, tenantId) {
        calls.push(["invoice", invoiceId, tenantId]);
        return {
          id: invoiceId,
          tenantId,
          amountUsdc: "5.00",
          status: "open",
          periodStart: "2026-03-01T00:00:00Z",
          periodEnd: "2026-03-31T23:59:59Z",
          statementHash: null,
          settlementTxHash: null,
        };
      },
    },
  });

  const summary = await readModels.getUsageSummary({ tenantId: "tenant-1", period: "2026-03" });
  const invoice = await readModels.getInvoice({ tenantId: "tenant-1", invoiceId: "inv-1" });

  assert.equal(summary.usage.message_parses, 3);
  assert.equal(invoice.invoice_id, "inv-1");
  assert.equal(calls.length, 2);
});
