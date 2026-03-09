export const MAILBOX_CREDENTIALS_RESET_JOB = "mailbox.credentials.reset";

export function createMailboxCredentialsResetJob({ store, mailBackend }) {
  return async function runMailboxCredentialsResetJob(payload) {
    const credentials = await mailBackend.issueMailboxCredentials({
      tenantId: payload.tenantId,
      agentId: payload.agentId,
      mailboxId: payload.mailboxId,
      address: payload.address,
      providerRef: payload.providerRef || null,
    });

    if (payload.mailboxAccountId && typeof store.markMailboxAccountCredentialsReset === "function") {
      await store.markMailboxAccountCredentialsReset(payload.mailboxAccountId);
    }

    return {
      mailboxId: payload.mailboxId,
      address: payload.address,
      credentials: credentials || null,
    };
  };
}
