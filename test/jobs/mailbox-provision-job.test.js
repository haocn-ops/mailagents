import test from "node:test";
import assert from "node:assert/strict";
import { createMailboxProvisionJob } from "../../src/jobs/mailbox-provision-job.js";

test("mailbox provision job provisions mailbox and persists provider ref", async () => {
  let saved = null;
  const store = {
    async saveMailboxProviderRef(mailboxId, providerRef) {
      saved = { mailboxId, providerRef };
    },
  };
  const mailBackend = {
    async provisionMailbox({ address }) {
      assert.equal(address, "agent@example.com");
      return {
        providerRef: "provider-ref",
        credentials: {
          login: "agent@example.com",
          password: "secret",
          webmailUrl: "https://mail.example.com",
        },
      };
    },
  };

  const job = createMailboxProvisionJob({ store, mailBackend });
  const result = await job({
    tenantId: "tenant-1",
    agentId: "agent-1",
    mailboxId: "mailbox-1",
    address: "agent@example.com",
    ttlHours: 1,
  });

  assert.deepEqual(saved, {
    mailboxId: "mailbox-1",
    providerRef: "provider-ref",
  });
  assert.equal(result.credentials.login, "agent@example.com");
});
