import process from "node:process";

export function getEnv(name, required = true) {
  const value = process.env[name];
  if (required && !value) {
    throw new Error(`${name} is required`);
  }
  return value || "";
}

export async function requestJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

export async function allocateLease({ apiBase, accessToken, agentId, purpose, ttlHours = 1 }) {
  return requestJson(`${apiBase}/v2/mailboxes/leases`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ agent_id: agentId, purpose, ttl_hours: ttlHours }),
  });
}

export async function sendMessage({ apiBase, accessToken, mailboxId, mailboxPassword, to, subject, text }) {
  return requestJson(`${apiBase}/v2/messages/send`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      mailbox_id: mailboxId,
      mailbox_password: mailboxPassword,
      to,
      subject,
      text,
    }),
  });
}

export async function releaseLease({ apiBase, accessToken, leaseId }) {
  return requestJson(`${apiBase}/v2/mailboxes/leases/${leaseId}/release`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
}
