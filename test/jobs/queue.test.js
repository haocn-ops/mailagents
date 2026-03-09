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
