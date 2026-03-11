import process from "node:process";

const API_BASE = (process.env.API_BASE || "https://api.mailagents.net").replace(/\/$/, "");
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || "";
const AGENT_ID = process.env.AGENT_ID || "";
const PURPOSE = process.env.PURPOSE || "demo-inbox";
const TTL_HOURS = Number(process.env.TTL_HOURS || 1);
const POLL_INTERVAL_SECONDS = Number(process.env.POLL_INTERVAL_SECONDS || 15);
const IDLE_RELEASE_MINUTES = Number(process.env.IDLE_RELEASE_MINUTES || 30);
const AUTO_REPLY_SUBJECT = process.env.AUTO_REPLY_SUBJECT || "Thanks for trying Mailagents";
const AUTO_REPLY_TEXT =
  process.env.AUTO_REPLY_TEXT ||
  "We received your email. This is a demo auto-reply from a leased inbox. We will release this inbox after the demo session.";

if (!ACCESS_TOKEN || !AGENT_ID) {
  console.error("ACCESS_TOKEN and AGENT_ID are required.");
  process.exit(1);
}

async function requestJson(path, { method = "GET", headers = {}, body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function requestPaymentProof(method, path) {
  const payload = { method, path };
  const result = await requestJson("/v1/payments/proof", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });
  return result?.x_payment_proof || result?.payment_proof || "";
}

async function allocateLease() {
  const proof = await requestPaymentProof("POST", "/v1/mailboxes/allocate");
  const payload = {
    agent_id: AGENT_ID,
    purpose: PURPOSE,
    ttl_hours: TTL_HOURS,
  };
  const result = await requestJson("/v1/mailboxes/allocate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ACCESS_TOKEN}`,
      "x-payment-proof": proof,
    },
    body: JSON.stringify(payload),
  });
  return result;
}

async function resetCredentials(mailboxId) {
  const result = await requestJson("/v1/mailboxes/credentials/reset", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ mailbox_id: mailboxId }),
  });
  return result?.webmail_password || result?.mailbox_password || "";
}

async function fetchLatest(mailboxId) {
  const proof = await requestPaymentProof("GET", "/v1/messages/latest");
  const params = new URLSearchParams({ mailbox_id: mailboxId, limit: "1" });
  const result = await requestJson(`/v1/messages/latest?${params.toString()}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${ACCESS_TOKEN}`,
      "x-payment-proof": proof,
    },
  });
  return result?.messages || [];
}

async function sendReply({ mailboxId, mailboxPassword, to, subject }) {
  const proof = await requestPaymentProof("POST", "/v1/messages/send");
  const payload = {
    mailbox_id: mailboxId,
    mailbox_password: mailboxPassword,
    to,
    subject: `Re: ${subject || AUTO_REPLY_SUBJECT}`,
    text: AUTO_REPLY_TEXT,
  };
  await requestJson("/v1/messages/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ACCESS_TOKEN}`,
      "x-payment-proof": proof,
    },
    body: JSON.stringify(payload),
  });
}

async function releaseMailbox(mailboxId) {
  await requestJson("/v1/mailboxes/release", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ mailbox_id: mailboxId }),
  });
}

async function main() {
  console.log("Allocating demo mailbox lease...");
  const lease = await allocateLease();
  const mailboxId = lease?.mailbox_id;
  const address = lease?.address;

  if (!mailboxId) {
    throw new Error("Lease allocation failed: mailbox_id missing.");
  }

  const mailboxPassword = await resetCredentials(mailboxId);
  if (!mailboxPassword) {
    throw new Error("Mailbox password reset failed.");
  }

  console.log(`Demo inbox ready: ${address}`);

  let lastMessageId = null;
  let lastActivityAt = Date.now();

  const timer = setInterval(async () => {
    try {
      const messages = await fetchLatest(mailboxId);
      const latest = messages[0];

      if (latest?.message_id && latest.message_id !== lastMessageId) {
        lastMessageId = latest.message_id;
        lastActivityAt = Date.now();
        if (latest.sender) {
          console.log(`New message from ${latest.sender}, replying...`);
          await sendReply({
            mailboxId,
            mailboxPassword,
            to: latest.sender,
            subject: latest.subject,
          });
        }
      }

      const idleMs = Date.now() - lastActivityAt;
      if (idleMs > IDLE_RELEASE_MINUTES * 60 * 1000) {
        console.log("Idle timeout reached, releasing lease.");
        clearInterval(timer);
        await releaseMailbox(mailboxId);
        process.exit(0);
      }
    } catch (err) {
      console.error(`Polling error: ${err.message}`);
    }
  }, POLL_INTERVAL_SECONDS * 1000);

  const shutdown = async () => {
    console.log("Shutting down, releasing lease.");
    clearInterval(timer);
    await releaseMailbox(mailboxId);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(`demo inbox bot failed: ${err.message}`);
  process.exit(1);
});
