import test from "node:test";
import assert from "node:assert/strict";
import { createMailboxReleaseJob } from "../../src/jobs/mailbox-release-job.js";

test("mailbox release job delegates to backend and updates V2 state", async () => {
  let releasedAccount = null;
  let releasedLease = null;
  const store = {
    async markMailboxAccountReleased(mailboxAccountId) {
      releasedAccount = mailboxAccountId;
    },
    async markMailboxLeaseV2Released(leaseId) {
      releasedLease = leaseId;
    },
  };
  const mailBackend = {
    async releaseMailbox({ address }) {
      assert.equal(address, "agent@example.com");
      return { status: "released" };
    },
  };

  const job = createMailboxReleaseJob({ store, mailBackend });
  const result = await job({
    tenantId: "tenant-1",
    mailboxId: "mailbox-1",
    address: "agent@example.com",
    providerRef: "provider-ref",
    mailboxAccountId: "account-1",
    mailboxLeaseV2Id: "lease-v2-1",
  });

  assert.equal(releasedAccount, "account-1");
  assert.equal(releasedLease, "lease-v2-1");
  assert.equal(result.release.status, "released");
});
