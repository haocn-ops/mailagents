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
}

export function createJobQueue(options = {}) {
  return new InMemoryJobQueue(options);
}
