import { parsePeriod } from "../utils.js";
import { createV2TenantRepository } from "./tenant-repository.js";
import {
  toV2Invoice,
  toV2MailboxAccount,
  toV2MailboxLease,
  toV2Message,
} from "./presenters.js";

export function createV2TenantReadModels({ store }) {
  const repository = createV2TenantRepository({ store });

  return {
    async listMailboxAccounts(tenantId) {
      const mailboxes = await repository.listTenantMailboxes(tenantId);
      const items = [];
      for (const mailbox of mailboxes) {
        const lease = await repository.getActiveLeaseByMailboxId(mailbox.mailbox_id);
        items.push(toV2MailboxAccount(mailbox, lease));
      }
      return items;
    },

    async listMailboxLeases(tenantId) {
      const mailboxes = await repository.listTenantMailboxes(tenantId);
      const items = [];
      for (const mailbox of mailboxes) {
        const lease = await repository.getActiveLeaseByMailboxId(mailbox.mailbox_id);
        if (lease) items.push(toV2MailboxLease(mailbox, lease));
      }
      return items;
    },

    async listMessages({ tenantId, mailboxId, since, limit }) {
      const messages = await repository.getLatestMessages({ tenantId, mailboxId, since, limit });
      if (messages === null) return null;
      return messages.map(toV2Message);
    },

    async getMessage(tenantId, messageId) {
      const message = await repository.getTenantMessageDetail(tenantId, messageId);
      if (!message) return null;
      return toV2Message(message);
    },

    async listSendAttempts(tenantId) {
      return repository.listTenantSendAttempts(tenantId);
    },

    async getSendAttempt(tenantId, sendAttemptId) {
      return repository.getTenantSendAttempt(tenantId, sendAttemptId);
    },

    async listWebhooks(tenantId) {
      return repository.listTenantWebhooks(tenantId);
    },

    async listWebhookDeliveries({ tenantId, webhookId }) {
      return repository.listTenantWebhookDeliveries(tenantId, { webhookId });
    },

    async getUsageSummary({ tenantId, period }) {
      const parsed = parsePeriod(period);
      if (!parsed) return null;

      const summary = await repository.usageSummary(tenantId, parsed.start, parsed.end);
      return {
        period,
        usage: {
          api_calls: summary.api_calls,
          active_mailboxes: summary.active_mailboxes,
          message_parses: summary.message_parses,
          billable_units: summary.billable_units,
        },
      };
    },

    async listInvoices({ tenantId, period }) {
      return repository.listTenantInvoices(tenantId, period);
    },

    async getInvoice({ tenantId, invoiceId }) {
      const invoice = await repository.getInvoice(invoiceId, tenantId);
      if (!invoice) return null;
      return toV2Invoice(invoice);
    },
  };
}
