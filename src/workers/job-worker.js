import { config } from "../config.js";
import { createMailBackendAdapter } from "../mail-backend/index.js";
import { createMailboxProvisionJob, MAILBOX_PROVISION_JOB } from "../jobs/mailbox-provision-job.js";
import { createJobQueue } from "../jobs/queue.js";
import { createSendSubmitJob, SEND_SUBMIT_JOB } from "../jobs/send-submit-job.js";
import { getDefaultStore } from "../store.js";

const store = getDefaultStore();
const mailBackend = createMailBackendAdapter(config);
const queue = createJobQueue({
  backend: config.queueBackend,
  redisUrl: config.queueRedisUrl,
  prefix: config.queuePrefix,
  mode: config.queueBackend === "redis" ? "worker" : "manual",
});

queue.register(MAILBOX_PROVISION_JOB, createMailboxProvisionJob({ store, mailBackend }));
queue.register(SEND_SUBMIT_JOB, createSendSubmitJob({ mailBackend }));

console.log("Mailagents job worker initialized");
console.log(`queue_backend=${config.queueBackend}`);
console.log(`queue_mode=${queue.mode}`);
console.log(`registered_jobs=${[MAILBOX_PROVISION_JOB, SEND_SUBMIT_JOB].join(",")}`);

await queue.startWorkers();

setInterval(() => {}, 60_000);
