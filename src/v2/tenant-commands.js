import { createV2TenantRepository } from "./tenant-repository.js";
import {
  toV2AllocatedLease,
  toV2MailboxCredentials,
  toV2ReleasedLease,
  toV2SendResult,
  toV2Webhook,
} from "./presenters.js";

export function createV2TenantCommands({ store, mailBackend }) {
  const repository = createV2TenantRepository({ store });

  return {
    async allocateLease({ tenantId, agentId, purpose, ttlHours }) {
      const result = await repository.allocateMailbox({ tenantId, agentId, purpose, ttlHours });
      if (!result) return null;

      let provider = null;
      try {
        provider = await mailBackend.provisionMailbox({
          tenantId,
          agentId,
          mailboxId: result.mailbox.id,
          address: result.mailbox.address,
          ttlHours,
        });
        if (provider?.providerRef) {
          await repository.saveMailboxProviderRef(result.mailbox.id, provider.providerRef);
        }
      } catch (err) {
        await repository.releaseMailbox({ tenantId, mailboxId: result.mailbox.id });
        throw err;
      }

      return toV2AllocatedLease({
        lease: result.lease,
        mailbox: result.mailbox,
        provider,
      });
    },

    async releaseLease({ tenantId, leaseId }) {
      const lease = await repository.getTenantLeaseById(tenantId, leaseId);
      if (!lease) return null;

      const result = await repository.releaseMailbox({ tenantId, mailboxId: lease.mailboxId });
      if (!result) return null;

      await mailBackend.releaseMailbox({
        tenantId,
        mailboxId: lease.mailboxId,
        address: result.mailbox.address,
        providerRef: result.mailbox.providerRef || null,
      });

      return toV2ReleasedLease({ leaseId, mailboxId: lease.mailboxId });
    },

    async resetMailboxCredentials({ tenantId, agentId, accountId }) {
      const mailbox = await repository.getTenantMailbox(tenantId, accountId);
      if (!mailbox) return null;

      const credentials = await mailBackend.issueMailboxCredentials({
        tenantId,
        agentId,
        mailboxId: accountId,
        address: mailbox.address,
        providerRef: mailbox.providerRef || null,
      });

      return toV2MailboxCredentials({ mailbox, credentials });
    },

    async sendMessage({ tenantId, agentId, mailboxId, mailboxPassword, recipients, subject, text, html, requestId }) {
      const mailbox = await repository.getTenantMailbox(tenantId, mailboxId);
      if (!mailbox) return null;

      const attempt = await repository.createSendAttempt({
        tenantId,
        agentId,
        mailboxId,
        to: recipients,
        subject,
        text,
        html,
        requestId,
      });

      try {
        const delivery = await mailBackend.sendMailboxMessage({
          tenantId,
          agentId,
          mailboxId,
          address: mailbox.address,
          password: mailboxPassword,
          to: recipients,
          subject,
          text,
          html,
        });
        await repository.completeSendAttempt(attempt.send_attempt_id, delivery, { requestId });
      } catch (err) {
        await repository.failSendAttempt(attempt.send_attempt_id, err.message || "Mail backend send failed", { requestId });
        err.sendAttemptId = attempt.send_attempt_id;
        throw err;
      }

      const completedAttempt = await repository.getTenantSendAttempt(tenantId, attempt.send_attempt_id);
      return toV2SendResult({
        attemptId: attempt.send_attempt_id,
        completedAttempt,
      });
    },

    async createWebhook({ tenantId, eventTypes, targetUrl, secret }) {
      const webhook = await repository.createWebhook({ tenantId, eventTypes, targetUrl, secret });
      return toV2Webhook(webhook);
    },

    async rotateWebhookSecret({ tenantId, webhookId, actorDid, requestId }) {
      const webhook = await repository.getTenantWebhook(tenantId, webhookId);
      if (!webhook) return null;
      return repository.rotateTenantWebhookSecret(tenantId, webhookId, { actorDid, requestId });
    },
  };
}
