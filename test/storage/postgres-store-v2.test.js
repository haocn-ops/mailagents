import test from "node:test";
import assert from "node:assert/strict";
import { PostgresStore } from "../../src/storage/postgres-store.js";

test("postgres store lists webhook deliveries from webhook_deliveries table when available", async () => {
  const store = new PostgresStore({
    chainId: 84532,
    challengeTtlMs: 300000,
    mailboxDomain: "inbox.example.com",
  });

  let captured = null;
  store._loadV2TableAvailability = async () => ({ webhook_deliveries: true });
  store._query = async (text, values) => {
    captured = { text, values };
    return {
      rows: [
        {
          webhook_id: "wh_1",
          delivery_id: "del_1",
          status_code: 200,
          attempts: 1,
          ok: true,
          error_message: null,
          response_excerpt: null,
          request_id: "req_1",
          delivered_at: new Date("2026-03-10T01:00:00.000Z"),
        },
      ],
    };
  };

  const deliveries = await store.listTenantWebhookDeliveries("tenant_1", { webhookId: "wh_1" });

  assert.ok(captured.text.includes("from webhook_deliveries wd"));
  assert.deepEqual(captured.values, ["tenant_1", "wh_1"]);
  assert.deepEqual(deliveries, [
    {
      webhook_id: "wh_1",
      delivery_id: "del_1",
      status_code: 200,
      attempts: 1,
      ok: true,
      error_message: null,
      response_excerpt: null,
      request_id: "req_1",
      delivered_at: "2026-03-10T01:00:00.000Z",
    },
  ]);
});

test("postgres store falls back to audit logs when webhook_deliveries table is unavailable", async () => {
  const store = new PostgresStore({
    chainId: 84532,
    challengeTtlMs: 300000,
    mailboxDomain: "inbox.example.com",
  });

  let captured = null;
  store._loadV2TableAvailability = async () => ({ webhook_deliveries: false });
  store._query = async (text, values) => {
    captured = { text, values };
    return {
      rows: [
        {
          webhook_id: "wh_2",
          delivery_id: "audit_1",
          status_code: 503,
          attempts: 3,
          ok: false,
          error_message: "Webhook returned HTTP 503",
          response_excerpt: "upstream down",
          request_id: "req_2",
          delivered_at: new Date("2026-03-10T02:00:00.000Z"),
        },
      ],
    };
  };

  const deliveries = await store.listTenantWebhookDeliveries("tenant_2", { webhookId: "wh_2" });

  assert.ok(captured.text.includes("from audit_logs al"));
  assert.ok(captured.text.includes("and al.resource_id = $2"));
  assert.deepEqual(captured.values, ["tenant_2", "wh_2"]);
  assert.deepEqual(deliveries, [
    {
      webhook_id: "wh_2",
      delivery_id: "audit_1",
      status_code: 503,
      attempts: 3,
      ok: false,
      error_message: "Webhook returned HTTP 503",
      response_excerpt: "upstream down",
      request_id: "req_2",
      delivered_at: "2026-03-10T02:00:00.000Z",
    },
  ]);
});

test("postgres store fetches webhook delivery detail from webhook_deliveries table when available", async () => {
  const store = new PostgresStore({
    chainId: 84532,
    challengeTtlMs: 300000,
    mailboxDomain: "inbox.example.com",
  });

  let captured = null;
  store._loadV2TableAvailability = async () => ({ webhook_deliveries: true });
  store._query = async (text, values) => {
    captured = { text, values };
    return {
      rowCount: 1,
      rows: [
        {
          webhook_id: "wh_detail_1",
          delivery_id: "del_detail_1",
          status_code: 201,
          attempts: 2,
          ok: true,
          error_message: null,
          response_excerpt: null,
          request_id: "req_detail_1",
          delivered_at: new Date("2026-03-10T04:00:00.000Z"),
        },
      ],
    };
  };

  const delivery = await store.getTenantWebhookDelivery("tenant_detail_1", "del_detail_1");

  assert.ok(captured.text.includes("from webhook_deliveries wd"));
  assert.deepEqual(captured.values, ["tenant_detail_1", "del_detail_1"]);
  assert.deepEqual(delivery, {
    webhook_id: "wh_detail_1",
    delivery_id: "del_detail_1",
    status_code: 201,
    attempts: 2,
    ok: true,
    error_message: null,
    response_excerpt: null,
    request_id: "req_detail_1",
    delivered_at: "2026-03-10T04:00:00.000Z",
  });
});

test("postgres store fetches webhook delivery detail from audit logs when table is unavailable", async () => {
  const store = new PostgresStore({
    chainId: 84532,
    challengeTtlMs: 300000,
    mailboxDomain: "inbox.example.com",
  });

  let captured = null;
  store._loadV2TableAvailability = async () => ({ webhook_deliveries: false });
  store._query = async (text, values) => {
    captured = { text, values };
    return {
      rowCount: 1,
      rows: [
        {
          webhook_id: "wh_detail_2",
          delivery_id: "audit_detail_2",
          status_code: 500,
          attempts: 1,
          ok: false,
          error_message: "Webhook request failed",
          response_excerpt: null,
          request_id: "req_detail_2",
          delivered_at: new Date("2026-03-10T05:00:00.000Z"),
        },
      ],
    };
  };

  const delivery = await store.getTenantWebhookDelivery("tenant_detail_2", "audit_detail_2");

  assert.ok(captured.text.includes("from audit_logs al"));
  assert.deepEqual(captured.values, ["tenant_detail_2", "audit_detail_2"]);
  assert.deepEqual(delivery, {
    webhook_id: "wh_detail_2",
    delivery_id: "audit_detail_2",
    status_code: 500,
    attempts: 1,
    ok: false,
    error_message: "Webhook request failed",
    response_excerpt: null,
    request_id: "req_detail_2",
    delivered_at: "2026-03-10T05:00:00.000Z",
  });
});

test("postgres store recordWebhookDelivery writes first-class delivery record when table exists", async () => {
  const store = new PostgresStore({
    chainId: 84532,
    challengeTtlMs: 300000,
    mailboxDomain: "inbox.example.com",
  });

  const calls = [];
  const audits = [];
  store._loadV2TableAvailability = async () => ({ webhook_deliveries: true });
  store._withTx = async (fn) => fn({ tx: true });
  store._query = async (text, values, client) => {
    calls.push({ text, values, client });
    if (text.includes("update webhooks")) {
      return { rowCount: 1, rows: [{ tenant_id: "tenant_3" }] };
    }
    return { rowCount: 1, rows: [] };
  };
  store._recordAudit = async (payload) => {
    audits.push(payload);
  };

  const result = await store.recordWebhookDelivery("wh_3", {
    statusCode: 202,
    requestId: "req_3",
    metadata: {
      event_type: "otp.extracted",
      resource_id: "msg_3",
      attempts: 2,
      ok: true,
      response_excerpt: null,
      error_message: null,
    },
  });

  assert.deepEqual(result, { webhookId: "wh_3" });
  assert.ok(calls.some((call) => call.text.includes("insert into webhook_deliveries")));
  assert.equal(audits.length, 1);
  assert.equal(audits[0].tenantId, "tenant_3");
  assert.equal(audits[0].action, "webhook.deliver");
  assert.equal(audits[0].requestId, "req_3");
});

test("postgres store recordWebhookDelivery skips first-class insert when table is absent", async () => {
  const store = new PostgresStore({
    chainId: 84532,
    challengeTtlMs: 300000,
    mailboxDomain: "inbox.example.com",
  });

  const calls = [];
  const audits = [];
  store._loadV2TableAvailability = async () => ({ webhook_deliveries: false });
  store._withTx = async (fn) => fn({ tx: true });
  store._query = async (text, values, client) => {
    calls.push({ text, values, client });
    if (text.includes("update webhooks")) {
      return { rowCount: 1, rows: [{ tenant_id: "tenant_4" }] };
    }
    return { rowCount: 1, rows: [] };
  };
  store._recordAudit = async (payload) => {
    audits.push(payload);
  };

  const result = await store.recordWebhookDelivery("wh_4", {
    statusCode: 500,
    requestId: "req_4",
    metadata: {
      attempts: 1,
      ok: false,
      error_message: "Webhook request failed",
    },
  });

  assert.deepEqual(result, { webhookId: "wh_4" });
  assert.ok(!calls.some((call) => call.text.includes("insert into webhook_deliveries")));
  assert.equal(audits.length, 1);
  assert.equal(audits[0].tenantId, "tenant_4");
});

test("postgres store lists admin webhook deliveries from webhook_deliveries table when available", async () => {
  const store = new PostgresStore({
    chainId: 84532,
    challengeTtlMs: 300000,
    mailboxDomain: "inbox.example.com",
  });

  let captured = null;
  store._loadV2TableAvailability = async () => ({ webhook_deliveries: true });
  store._query = async (text, values) => {
    captured = { text, values };
    return {
      rows: [
        {
          webhook_id: "wh_admin_1",
          tenant_id: "tenant_admin_1",
          delivery_id: "del_admin_1",
          status_code: 202,
          attempts: 2,
          ok: true,
          error_message: null,
          response_excerpt: null,
          request_id: "req_admin_1",
          delivered_at: new Date("2026-03-10T03:00:00.000Z"),
        },
      ],
    };
  };

  const deliveries = await store.adminListWebhookDeliveries({
    page: 1,
    pageSize: 20,
    tenantId: "tenant_admin_1",
    webhookId: "wh_admin_1",
  });

  assert.ok(captured.text.includes("from webhook_deliveries wd"));
  assert.deepEqual(captured.values, ["tenant_admin_1", "wh_admin_1"]);
  assert.equal(deliveries.page, 1);
  assert.deepEqual(deliveries.items, [
    {
      webhook_id: "wh_admin_1",
      tenant_id: "tenant_admin_1",
      delivery_id: "del_admin_1",
      status_code: 202,
      attempts: 2,
      ok: true,
      error_message: null,
      response_excerpt: null,
      request_id: "req_admin_1",
      delivered_at: "2026-03-10T03:00:00.000Z",
    },
  ]);
});

test("postgres store lists admin webhook deliveries from audit logs when table is unavailable", async () => {
  const store = new PostgresStore({
    chainId: 84532,
    challengeTtlMs: 300000,
    mailboxDomain: "inbox.example.com",
  });

  let captured = null;
  store._loadV2TableAvailability = async () => ({ webhook_deliveries: false });
  store._query = async (text, values) => {
    captured = { text, values };
    return {
      rows: [
        {
          webhook_id: "wh_admin_2",
          tenant_id: "tenant_admin_2",
          delivery_id: "audit_admin_1",
          status_code: 500,
          attempts: 3,
          ok: false,
          error_message: "Webhook request failed",
          response_excerpt: "gateway timeout",
          request_id: "req_admin_2",
          delivered_at: new Date("2026-03-10T04:00:00.000Z"),
        },
      ],
    };
  };

  const deliveries = await store.adminListWebhookDeliveries({
    page: 1,
    pageSize: 20,
    tenantId: "tenant_admin_2",
    webhookId: "wh_admin_2",
  });

  assert.ok(captured.text.includes("from audit_logs al"));
  assert.ok(captured.text.includes("al.action = 'webhook.deliver'"));
  assert.deepEqual(captured.values, ["tenant_admin_2", "wh_admin_2"]);
  assert.equal(deliveries.page, 1);
  assert.deepEqual(deliveries.items, [
    {
      webhook_id: "wh_admin_2",
      tenant_id: "tenant_admin_2",
      delivery_id: "audit_admin_1",
      status_code: 500,
      attempts: 3,
      ok: false,
      error_message: "Webhook request failed",
      response_excerpt: "gateway timeout",
      request_id: "req_admin_2",
      delivered_at: "2026-03-10T04:00:00.000Z",
    },
  ]);
});

test("postgres store lists admin send attempts with tenant filter", async () => {
  const store = new PostgresStore({
    chainId: 84532,
    challengeTtlMs: 300000,
    mailboxDomain: "inbox.example.com",
  });

  let captured = null;
  store._query = async (text, values) => {
    captured = { text, values };
    return {
      rows: [
        {
          tenant_id: "tenant_send_1",
          agent_id: "agent_send_1",
          resource_id: "attempt_send_1",
          metadata: {
            mailboxId: "mailbox_send_1",
            to: ["dest@example.com"],
            subject: "admin send list",
            submissionStatus: "accepted",
            accepted: ["dest@example.com"],
            rejected: [],
            messageId: "msg_send_1",
            response: "250 ok",
            envelope: null,
            error: null,
            createdAt: "2026-03-10T05:00:00.000Z",
            updatedAt: "2026-03-10T05:01:00.000Z",
          },
          created_at: new Date("2026-03-10T05:01:00.000Z"),
        },
      ],
    };
  };

  const listed = await store.adminListSendAttempts({
    page: 1,
    pageSize: 20,
    tenantId: "tenant_send_1",
    mailboxId: "mailbox_send_1",
    submissionStatus: "accepted",
  });

  assert.ok(captured.text.includes("resource_type = 'send_attempt'"));
  assert.deepEqual(captured.values, ["tenant_send_1"]);
  assert.equal(listed.page, 1);
  assert.deepEqual(listed.items, [
    {
      tenant_id: "tenant_send_1",
      agent_id: "agent_send_1",
      send_attempt_id: "attempt_send_1",
      mailbox_id: "mailbox_send_1",
      to: ["dest@example.com"],
      subject: "admin send list",
      submission_status: "accepted",
      accepted: ["dest@example.com"],
      rejected: [],
      message_id: "msg_send_1",
      response: "250 ok",
      envelope: null,
      error: null,
      created_at: "2026-03-10T05:00:00.000Z",
      updated_at: "2026-03-10T05:01:00.000Z",
    },
  ]);
});
