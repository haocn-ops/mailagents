import { parsePeriod } from "../utils.js";
import {
  toV2Invoice,
  toV2MailboxAccount,
  toV2MailboxLease,
  toV2Message,
} from "./presenters.js";

export function createV2TenantReadModels({ store }) {
  return {
    async listMailboxAccounts(tenantId) {
      const mailboxes = await store.listTenantMailboxes(tenantId);
      const items = [];
      for (const mailbox of mailboxes) {
        const lease = await store.getActiveLeaseByMailboxId(mailbox.mailbox_id);
        items.push(toV2MailboxAccount(mailbox, lease));
      }
      return items;
    },

    async listMailboxLeases(tenantId) {
      const mailboxes = await store.listTenantMailboxes(tenantId);
      const items = [];
      for (const mailbox of mailboxes) {
        const lease = await store.getActiveLeaseByMailboxId(mailbox.mailbox_id);
        if (lease) items.push(toV2MailboxLease(mailbox, lease));
      }
      return items;
    },

    async listMessages({ tenantId, mailboxId, since, limit }) {
      const messages = await store.getLatestMessages({ tenantId, mailboxId, since, limit });
      if (messages === null) return null;
      return messages.map(toV2Message);
    },

    async getMessage(tenantId, messageId) {
      const message = await store.getTenantMessageDetail(tenantId, messageId);
      if (!message) return null;
      return toV2Message(message);
    },

    async listSendAttempts(tenantId) {
      return store.listTenantSendAttempts(tenantId);
    },

    async getSendAttempt(tenantId, sendAttemptId) {
      return store.getTenantSendAttempt(tenantId, sendAttemptId);
    },

    async listWebhooks(tenantId) {
      return store.listTenantWebhooks(tenantId);
    },

    async listWebhookDeliveries({ tenantId, webhookId }) {
      return store.listTenantWebhookDeliveries(tenantId, { webhookId });
    },

    async getUsageSummary({ tenantId, period }) {
      const parsed = parsePeriod(period);
      if (!parsed) return null;

      const summary = await store.usageSummary(tenantId, parsed.start, parsed.end);
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
      return store.listTenantInvoices(tenantId, period);
    },

    async getInvoice({ tenantId, invoiceId }) {
      const invoice = await store.getInvoice(invoiceId, tenantId);
      if (!invoice) return null;
      return toV2Invoice(invoice);
    },
  };
}
