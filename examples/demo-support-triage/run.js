import process from "node:process";
import { allocateLease, getEnv, releaseLease, sendMessage } from "../lib/demo-client.js";

async function main() {
  const apiBase = getEnv("API_BASE");
  const accessToken = getEnv("ACCESS_TOKEN");
  const agentId = getEnv("AGENT_ID");
  const toEmail = process.env.TO_EMAIL || "";

  const lease = await allocateLease({
    apiBase,
    accessToken,
    agentId,
    purpose: "support-triage",
    ttlHours: 2,
  });

  console.log(`Support inbox: ${lease.address}`);

  if (toEmail) {
    await sendMessage({
      apiBase,
      accessToken,
      mailboxId: lease.mailbox_id,
      mailboxPassword: lease.webmail_password,
      to: [toEmail],
      subject: "Support request received",
      text: "This is a demo support acknowledgement from the triage agent.",
    });
    console.log(`Sent demo support acknowledgement to ${toEmail}`);
  } else {
    console.log("TO_EMAIL not set. Send a support email to the leased inbox to test inbound parsing.");
  }

  await releaseLease({ apiBase, accessToken, leaseId: lease.lease_id });
  console.log("Lease released.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
