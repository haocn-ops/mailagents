import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { buildAuthHeader, requestJson } from "./http-client.js";

function parseHeaders(rawHeaders) {
  const lines = rawHeaders.split(/\r?\n/);
  const unfolded = [];
  for (const line of lines) {
    if (/^[ \t]/.test(line) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += ` ${line.trim()}`;
    } else {
      unfolded.push(line);
    }
  }

  const headers = {};
  for (const line of unfolded) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    headers[key] = value;
  }
  return headers;
}

function splitMessage(raw) {
  const match = raw.match(/\r?\n\r?\n/);
  if (!match || match.index === undefined) {
    return { headers: {}, body: raw };
  }
  const boundaryIndex = match.index;
  const rawHeaders = raw.slice(0, boundaryIndex);
  const body = raw.slice(boundaryIndex + match[0].length);
  return { headers: parseHeaders(rawHeaders), body };
}

function parseAddress(fromValue) {
  const raw = String(fromValue || "").trim();
  const match = raw.match(/<([^>]+)>/);
  const email = (match ? match[1] : raw).trim().toLowerCase();
  const at = email.lastIndexOf("@");
  return {
    sender: email || null,
    senderDomain: at >= 0 ? email.slice(at + 1) : null,
  };
}

function excerpt(text, length = 4000) {
  return String(text || "").replace(/\0/g, "").slice(0, length);
}

function providerMessageId(headers, filePath) {
  const messageId = String(headers["message-id"] || "").trim();
  if (messageId) return messageId;
  return `maildir:${filePath}`;
}

async function listMailboxFiles(rootDir) {
  const mailboxes = await readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const mailboxDir of mailboxes) {
    if (!mailboxDir.isDirectory()) continue;
    const address = mailboxDir.name;
    for (const folder of ["new", "cur"]) {
      const folderPath = path.join(rootDir, address, folder);
      let entries = [];
      try {
        entries = await readdir(folderPath, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        files.push({
          address,
          filePath: path.join(folderPath, entry.name),
        });
      }
    }
  }

  return files;
}

async function loadState(stateFile) {
  try {
    const raw = await readFile(stateFile, "utf8");
    return JSON.parse(raw);
  } catch {
    return { files: {} };
  }
}

async function saveState(stateFile, state) {
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function shouldSync(saved, currentStat) {
  if (!saved) return true;
  return saved.size !== currentStat.size || saved.mtimeMs !== currentStat.mtimeMs;
}

export async function syncMailuMaildir({
  mailRoot,
  stateFile,
  agentsBaseUrl,
  internalApiToken,
  fetchImpl = fetch,
  logger = console,
}) {
  if (!mailRoot) throw new Error("mailRoot is required");
  if (!stateFile) throw new Error("stateFile is required");
  if (!agentsBaseUrl) throw new Error("agentsBaseUrl is required");
  if (!internalApiToken) throw new Error("internalApiToken is required");

  const files = await listMailboxFiles(mailRoot);
  const state = await loadState(stateFile);

  let scanned = 0;
  let synced = 0;

  for (const item of files) {
    scanned += 1;
    const fileStat = await stat(item.filePath);
    const prior = state.files[item.filePath];
    if (!shouldSync(prior, fileStat)) {
      continue;
    }

    const raw = await readFile(item.filePath, "utf8");
    const { headers, body } = splitMessage(raw);
    const { sender, senderDomain } = parseAddress(headers.from);
    const receivedAtHeader = headers.date;
    const receivedAtDate = receivedAtHeader ? new Date(receivedAtHeader) : null;
    const receivedAt = receivedAtDate && !Number.isNaN(receivedAtDate.getTime())
      ? receivedAtDate.toISOString()
      : new Date(fileStat.mtimeMs).toISOString();

    const payload = {
      address: item.address,
      provider_message_id: providerMessageId(headers, item.filePath),
      sender,
      sender_domain: senderDomain,
      subject: headers.subject || "(no subject)",
      received_at: receivedAt,
      raw_ref: `maildir://${item.filePath}`,
      text_excerpt: excerpt(body),
      headers,
    };

    try {
      await requestJson(`${agentsBaseUrl.replace(/\/$/, "")}/internal/inbound/events`, {
        method: "POST",
        headers: {
          authorization: buildAuthHeader(internalApiToken),
          "content-type": "application/json",
        },
        body: payload,
        expectedStatuses: [202],
        fetchImpl,
      });
    } catch (err) {
      throw new Error(`inbound sync failed for ${item.filePath}: ${err.message}`);
    }

    state.files[item.filePath] = {
      size: fileStat.size,
      mtimeMs: fileStat.mtimeMs,
      syncedAt: new Date().toISOString(),
      address: item.address,
      providerMessageId: payload.provider_message_id,
    };
    synced += 1;
    logger.log(`synced ${item.address} ${path.basename(item.filePath)}`);
  }

  await saveState(stateFile, state);
  return { scanned, synced };
}
