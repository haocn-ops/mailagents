import { config } from "../config.js";
import { createMailBackendAdapter } from "../mail-backend/index.js";
import {
  createMailboxCredentialsResetJob,
  MAILBOX_CREDENTIALS_RESET_JOB,
} from "../jobs/mailbox-credentials-reset-job.js";
import { createMessageParseJob, MESSAGE_PARSE_JOB } from "../jobs/message-parse-job.js";
import { createMailboxProvisionJob, MAILBOX_PROVISION_JOB } from "../jobs/mailbox-provision-job.js";
import { createMailboxReleaseJob, MAILBOX_RELEASE_JOB } from "../jobs/mailbox-release-job.js";
import { createJobQueue } from "../jobs/queue.js";
import { createSendSubmitJob, SEND_SUBMIT_JOB } from "../jobs/send-submit-job.js";
import { createWebhookDeliveryJob, WEBHOOK_DELIVERY_JOB } from "../jobs/webhook-delivery-job.js";
import { getDefaultStore } from "../store.js";
import { createWebhookDispatcher } from "../webhook-dispatcher.js";

const store = getDefaultStore();
const mailBackend = createMailBackendAdapter(config);
const webhookDispatcher = createWebhookDispatcher({
  secretEncryptionKey: config.webhookSecretEncryptionKey,
  timeoutMs: config.webhookTimeoutMs,
  retryAttempts: config.webhookRetryAttempts,
});
const queue = createJobQueue({
  backend: config.queueBackend,
  redisUrl: config.queueRedisUrl,
  prefix: config.queuePrefix,
  mode: config.queueBackend === "redis" ? "worker" : "manual",
});

queue.register(MAILBOX_PROVISION_JOB, createMailboxProvisionJob({ store, mailBackend }));
queue.register(MAILBOX_RELEASE_JOB, createMailboxReleaseJob({ store, mailBackend }));
queue.register(
  MAILBOX_CREDENTIALS_RESET_JOB,
  createMailboxCredentialsResetJob({ store, mailBackend }),
);
queue.register(SEND_SUBMIT_JOB, createSendSubmitJob({ mailBackend }));
queue.register(MESSAGE_PARSE_JOB, createMessageParseJob({ store, queue }));
queue.register(WEBHOOK_DELIVERY_JOB, createWebhookDeliveryJob({ store, webhookDispatcher }));

console.log("Mailagents job worker initialized");
console.log(`queue_backend=${config.queueBackend}`);
console.log(`queue_mode=${queue.mode}`);
console.log(
  `registered_jobs=${[
    MAILBOX_PROVISION_JOB,
    MAILBOX_RELEASE_JOB,
    MAILBOX_CREDENTIALS_RESET_JOB,
    SEND_SUBMIT_JOB,
    MESSAGE_PARSE_JOB,
    WEBHOOK_DELIVERY_JOB,
  ].join(",")}`,
);

await queue.startWorkers();

setInterval(() => {}, 60_000);
