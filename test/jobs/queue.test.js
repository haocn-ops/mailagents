import test from "node:test";
import assert from "node:assert/strict";
import { BullMqJobQueue, InMemoryJobQueue, createJobQueue } from "../../src/jobs/queue.js";

test("createJobQueue uses in-memory queue by default", () => {
  const queue = createJobQueue();
  assert.ok(queue instanceof InMemoryJobQueue);
  assert.equal(queue.mode, "inline");
});

test("createJobQueue builds redis queue adapter without eager redis connection", () => {
  const queue = createJobQueue({
    backend: "redis",
    redisUrl: "redis://localhost:6379",
    prefix: "mailagents-test",
    mode: "producer",
  });

  assert.ok(queue instanceof BullMqJobQueue);
  assert.equal(queue.redisUrl, "redis://localhost:6379");
  assert.equal(queue.prefix, "mailagents-test");
  assert.equal(queue.mode, "producer");
  assert.equal(queue.queues.size, 0);
  assert.equal(queue.workers.length, 0);
});

test("redis queue enqueue applies default retry and backoff options", async () => {
  const queue = new BullMqJobQueue({
    redisUrl: "redis://localhost:6379",
    defaultAttempts: 4,
    defaultBackoffMs: 1500,
  });

  const calls = [];
  queue._getQueue = async () => ({
    async add(type, payload, options) {
      calls.push({ type, payload, options });
      return { id: "10" };
    },
  });

  await queue.enqueue("message.parse", { messageId: "msg-1" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, "message.parse");
  assert.deepEqual(calls[0].payload, { messageId: "msg-1" });
  assert.equal(calls[0].options.attempts, 4);
  assert.equal(calls[0].options.backoff.type, "fixed");
  assert.equal(calls[0].options.backoff.delay, 1500);
});

test("redis queue enqueue allows per-job retry override", async () => {
  const queue = new BullMqJobQueue({
    redisUrl: "redis://localhost:6379",
    defaultAttempts: 3,
    defaultBackoffMs: 1000,
  });

  const calls = [];
  queue._getQueue = async () => ({
    async add(type, payload, options) {
      calls.push({ type, payload, options });
      return { id: "11" };
    },
  });

  await queue.enqueue("webhook.deliver", { webhookId: "wh-1" }, { attempts: 1, backoffMs: 0 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.attempts, 1);
  assert.equal("backoff" in calls[0].options, false);
});
