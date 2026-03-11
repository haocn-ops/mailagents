import test from "node:test";
import assert from "node:assert/strict";

import { createAdminService } from "../../src/services/admin-service.js";
import { createV2MailboxService } from "../../src/services/v2-mailbox-service.js";
import { createV2MessageService } from "../../src/services/v2-message-service.js";
import { createV2WebhookService } from "../../src/services/v2-webhook-service.js";
import { createV2BillingService } from "../../src/services/v2-billing-service.js";

test("admin service can run against injected repository seam", async () => {
  const calls = [];
  const repository = {
    async adminListWebhookDeliveries(args) {
      calls.push(args);
      return [{ webhook_delivery_id: "wd-1" }];
    },
  };
  const service = createAdminService({
    store: {},
    repository,
    getOverageChargeUsdc: () => 1,
    getAgentAllocateHourlyLimit: () => 2,
    updateRuntimeSettings: async () => {},
  });

  const result = await service.adminListWebhookDeliveries({ tenantId: "tenant-1", webhookId: "wh-1" });

  assert.deepEqual(result, [{ webhook_delivery_id: "wd-1" }]);
  assert.deepEqual(calls, [{ tenantId: "tenant-1", webhookId: "wh-1" }]);
});

test("v2 mailbox service can run against injected read-model and command seams", async () => {
  const readCalls = [];
  const commandCalls = [];
  const service = createV2MailboxService({
    store: {},
    mailBackend: {},
    readModels: {
      async getMailboxLease(tenantId, leaseId) {
        readCalls.push([tenantId, leaseId]);
        return { lease_id: leaseId, tenant_id: tenantId };
      },
    },
    commands: {
      async releaseLease(args) {
        commandCalls.push(args);
        return { released: true, lease_id: args.leaseId };
      },
    },
  });

  const lease = await service.getLease("tenant-1", "lease-1");
  const released = await service.releaseLease({ tenantId: "tenant-1", leaseId: "lease-1" });

  assert.deepEqual(lease, { lease_id: "lease-1", tenant_id: "tenant-1" });
  assert.deepEqual(released, { released: true, lease_id: "lease-1" });
  assert.deepEqual(readCalls, [["tenant-1", "lease-1"]]);
  assert.deepEqual(commandCalls, [{ tenantId: "tenant-1", leaseId: "lease-1" }]);
});

test("v2 message service can run against injected read-model and command seams", async () => {
  const readCalls = [];
  const commandCalls = [];
  const service = createV2MessageService({
    store: {},
    mailBackend: {},
    readModels: {
      async listMessages(args) {
        readCalls.push(args);
        return [{ message_id: "msg-1" }];
      },
      async getSendAttempt(tenantId, sendAttemptId) {
        readCalls.push({ tenantId, sendAttemptId });
        return { send_attempt_id: sendAttemptId };
      },
    },
    commands: {
      async sendMessage(args) {
        commandCalls.push(args);
        return { send_attempt_id: "sa-1" };
      },
    },
  });

  const messages = await service.listMessages({ tenantId: "tenant-1", mailboxId: "mb-1", since: "2026-03-10T00:00:00Z", limit: 10 });
  const attempt = await service.getSendAttempt("tenant-1", "sa-1");
  const sendResult = await service.sendMessage({
    tenantId: "tenant-1",
    agentId: "agent-1",
    mailboxId: "mb-1",
    mailboxPassword: "secret",
    recipients: ["a@example.com"],
    subject: "hello",
    text: "body",
    html: "<p>body</p>",
    requestId: "req-1",
  });

  assert.deepEqual(messages, [{ message_id: "msg-1" }]);
  assert.deepEqual(attempt, { send_attempt_id: "sa-1" });
  assert.deepEqual(sendResult, { send_attempt_id: "sa-1" });
  assert.deepEqual(readCalls, [
    { tenantId: "tenant-1", mailboxId: "mb-1", since: "2026-03-10T00:00:00Z", limit: 10 },
    { tenantId: "tenant-1", sendAttemptId: "sa-1" },
  ]);
  assert.equal(commandCalls.length, 1);
  assert.equal(commandCalls[0].tenantId, "tenant-1");
  assert.equal(commandCalls[0].requestId, "req-1");
});

test("v2 webhook service can run against injected read-model and command seams", async () => {
  const readCalls = [];
  const commandCalls = [];
  const service = createV2WebhookService({
    store: {},
    readModels: {
      async listWebhookDeliveries(args) {
        readCalls.push(args);
        return [{ webhook_delivery_id: "wd-1" }];
      },
    },
    commands: {
      async rotateWebhookSecret(args) {
        commandCalls.push(args);
        return { webhook_id: args.webhookId, rotated: true };
      },
    },
  });

  const deliveries = await service.listWebhookDeliveries({ tenantId: "tenant-1", webhookId: "wh-1" });
  const rotated = await service.rotateWebhookSecret({
    tenantId: "tenant-1",
    webhookId: "wh-1",
    actorDid: "did:example:admin",
    requestId: "req-1",
  });

  assert.deepEqual(deliveries, [{ webhook_delivery_id: "wd-1" }]);
  assert.deepEqual(rotated, { webhook_id: "wh-1", rotated: true });
  assert.deepEqual(readCalls, [{ tenantId: "tenant-1", webhookId: "wh-1" }]);
  assert.equal(commandCalls.length, 1);
  assert.equal(commandCalls[0].actorDid, "did:example:admin");
});

test("v2 billing service can run against injected read-model seam", async () => {
  const calls = [];
  const service = createV2BillingService({
    store: {},
    readModels: {
      async getUsageSummary(args) {
        calls.push(["summary", args]);
        return { period: args.period, usage: { api_calls: 3 } };
      },
      async getInvoice(args) {
        calls.push(["invoice", args]);
        return { invoice_id: args.invoiceId };
      },
    },
  });

  const summary = await service.getUsageSummary({ tenantId: "tenant-1", period: "2026-03" });
  const invoice = await service.getInvoice({ tenantId: "tenant-1", invoiceId: "inv-1" });

  assert.deepEqual(summary, { period: "2026-03", usage: { api_calls: 3 } });
  assert.deepEqual(invoice, { invoice_id: "inv-1" });
  assert.deepEqual(calls, [
    ["summary", { tenantId: "tenant-1", period: "2026-03" }],
    ["invoice", { tenantId: "tenant-1", invoiceId: "inv-1" }],
  ]);
});
