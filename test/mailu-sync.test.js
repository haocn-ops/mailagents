import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { syncMailuMaildir } from "../src/mailu-sync.js";

test("mailu maildir sync ingests new messages and records state", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mailu-sync-"));
  const mailRoot = path.join(root, "mail");
  const mailboxDir = path.join(mailRoot, "abc0000456-1@inbox.example.com", "new");
  const stateFile = path.join(root, "state.json");
  await mkdir(mailboxDir, { recursive: true });

  const emlPath = path.join(mailboxDir, "msg-1");
  await writeFile(
    emlPath,
    [
      "From: postmaster@inbox.example.com",
      "To: abc0000456-1@inbox.example.com",
      "Subject: OTP 482913",
      "Message-ID: <msg-1@example.com>",
      "Date: Fri, 06 Mar 2026 12:20:00 +0000",
      "",
      "Your verification code is 482913",
      "Verify here: https://example.com/verify?token=abc",
      "",
    ].join("\n"),
    "utf8",
  );

  const calls = [];
  const result = await syncMailuMaildir({
    mailRoot,
    stateFile,
    agentsBaseUrl: "http://agents.local",
    internalApiToken: "internal-secret",
    fetchImpl: async (url, init) => {
      calls.push([url, JSON.parse(init.body)]);
      return new Response("{}", { status: 202 });
    },
    logger: { log() {} },
  });

  assert.equal(result.scanned, 1);
  assert.equal(result.synced, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].address, "abc0000456-1@inbox.example.com");
  assert.equal(calls[0][1].provider_message_id, "<msg-1@example.com>");
  assert.match(calls[0][1].raw_ref, /^maildir:\/\//);

  const state = JSON.parse(await readFile(stateFile, "utf8"));
  assert.ok(state.files[emlPath]);
});
