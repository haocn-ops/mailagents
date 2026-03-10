import { randomUUID } from "node:crypto";

export class InMemoryJobQueue {
  constructor({ mode = "inline" } = {}) {
    this.mode = mode;
    this.handlers = new Map();
    this.jobs = new Map();
  }

  register(type, handler) {
    this.handlers.set(type, handler);
  }

  async enqueue(type, payload) {
    const job = {
      id: randomUUID(),
      type,
      payload,
      status: "queued",
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, job);

    if (this.mode === "inline") {
      await this.run(job.id);
    }

    return this.jobs.get(job.id);
  }

  async run(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const handler = this.handlers.get(job.type);
    if (!handler) {
      throw new Error(`No job handler registered for ${job.type}`);
    }

    job.status = "active";
    job.updatedAt = new Date().toISOString();

    try {
      const result = await handler(job.payload, { jobId: job.id, type: job.type });
      job.status = "completed";
      job.result = result ?? null;
      job.updatedAt = new Date().toISOString();
      return job;
    } catch (err) {
      job.status = "failed";
      job.error = err?.message || String(err);
      job.updatedAt = new Date().toISOString();
      throw err;
    }
  }

  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  listJobs() {
    return [...this.jobs.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async startWorkers() {
    return [];
  }
}

export class BullMqJobQueue {
  constructor({
    redisUrl,
    prefix = "mailagents",
    mode = "producer",
    defaultAttempts = 3,
    defaultBackoffMs = 1000,
  } = {}) {
    this.redisUrl = redisUrl;
    this.prefix = prefix;
    this.mode = mode;
    this.defaultAttempts = Math.max(1, Number(defaultAttempts) || 1);
    this.defaultBackoffMs = Math.max(0, Number(defaultBackoffMs) || 0);
    this.handlers = new Map();
    this.queues = new Map();
    this.workers = [];
    this.connection = null;
    this.Queue = null;
    this.Worker = null;
  }

  async _loadBullMq() {
    if (this.Queue && this.Worker) {
      return;
    }
    let bullmq;
    try {
      bullmq = await import("bullmq");
    } catch {
      throw new Error("Redis queue backend requires package 'bullmq'. Run: npm install");
    }
    this.Queue = bullmq.Queue;
    this.Worker = bullmq.Worker;
  }

  async _loadConnection() {
    if (this.connection) return this.connection;
    let IORedis;
    try {
      IORedis = (await import("ioredis")).default;
    } catch {
      throw new Error("Redis queue backend requires package 'ioredis'. Run: npm install");
    }
    this.connection = new IORedis(this.redisUrl, {
      maxRetriesPerRequest: null,
    });
    return this.connection;
  }

  async _getQueue(type) {
    await this._loadBullMq();
    const connection = await this._loadConnection();
    const name = `${this.prefix}:${type}`;
    if (!this.queues.has(name)) {
      this.queues.set(
        name,
        new this.Queue(name, {
          connection,
        }),
      );
    }
    return this.queues.get(name);
  }

  register(type, handler) {
    this.handlers.set(type, handler);
  }

  async enqueue(type, payload, options = {}) {
    const queue = await this._getQueue(type);
    const attempts = Math.max(1, Number(options.attempts ?? this.defaultAttempts) || 1);
    const backoffMs = Math.max(0, Number(options.backoffMs ?? this.defaultBackoffMs) || 0);
    const addOptions = {
      attempts,
    };
    if (attempts > 1 && backoffMs > 0) {
      addOptions.backoff = { type: "fixed", delay: backoffMs };
    }
    const job = await queue.add(type, payload, addOptions);
    return {
      id: String(job.id),
      type,
      payload,
      status: "queued",
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async startWorkers() {
    if (this.mode !== "worker") return [];
    await this._loadBullMq();
    const connection = await this._loadConnection();

    for (const [type, handler] of this.handlers.entries()) {
      const name = `${this.prefix}:${type}`;
      const worker = new this.Worker(
        name,
        async (job) => handler(job.data, { jobId: String(job.id), type }),
        { connection },
      );
      this.workers.push(worker);
    }

    return this.workers;
  }

  async close() {
    await Promise.all(this.workers.map((worker) => worker.close()));
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    if (this.connection) {
      await this.connection.quit();
    }
  }
}

export function createJobQueue(options = {}) {
  if (options.backend === "redis") {
    return new BullMqJobQueue({
      redisUrl: options.redisUrl,
      prefix: options.prefix,
      mode: options.mode,
      defaultAttempts: options.defaultAttempts,
      defaultBackoffMs: options.defaultBackoffMs,
    });
  }
  return new InMemoryJobQueue(options);
}
