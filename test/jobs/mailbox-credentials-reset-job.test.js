import test from "node:test";
import assert from "node:assert/strict";
import { createMailboxCredentialsResetJob } from "../../src/jobs/mailbox-credentials-reset-job.js";

test("mailbox credentials reset job delegates to backend and updates V2 state", async () => {
  let resetAccount = null;
  const store = {
    async markMailboxAccountCredentialsReset(mailboxAccountId) {
      resetAccount = mailboxAccountId;
    },
  };
  const mailBackend = {
    async issueMailboxCredentials({ address }) {
      assert.equal(address, "agent@example.com");
      return {
        login: "agent@example.com",
        password: "new-secret",
        webmailUrl: "https://mail.example.com",
      };
    },
  };

  const job = createMailboxCredentialsResetJob({ store, mailBackend });
  const result = await job({
    tenantId: "tenant-1",
    agentId: "agent-1",
    mailboxId: "mailbox-1",
    address: "agent@example.com",
    providerRef: "provider-ref",
    mailboxAccountId: "account-1",
  });

  assert.equal(resetAccount, "account-1");
  assert.equal(result.credentials.password, "new-secret");
});
