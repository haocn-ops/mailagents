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
    purpose: "alerts",
    ttlHours: 2,
  });

  console.log(`Alerts inbox: ${lease.address}`);

  if (toEmail) {
    await sendMessage({
      apiBase,
      accessToken,
      mailboxId: lease.mailbox_id,
      mailboxPassword: lease.webmail_password,
      to: [toEmail],
      subject: "ALERT: Demo escalation",
      text: "This is a demo escalation notice from the alerts agent.",
    });
    console.log(`Sent demo escalation to ${toEmail}`);
  } else {
    console.log("TO_EMAIL not set. Send an alert email to the leased inbox to test inbound parsing.");
  }

  await releaseLease({ apiBase, accessToken, leaseId: lease.lease_id });
  console.log("Lease released.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
