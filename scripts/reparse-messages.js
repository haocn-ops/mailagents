#!/usr/bin/env node
import process from "node:process";
import { parseInboundContent } from "../src/parser.js";
import { createConfig } from "../src/config.js";
import { createStoreFromConfig } from "../src/store.js";

function parseArgs(argv) {
  const args = { apply: false, limit: 100, tenantId: null, messageId: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    if (arg === "--tenant-id") args.tenantId = argv[i + 1] || null, i += 1;
    if (arg === "--message-id") args.messageId = argv[i + 1] || null, i += 1;
    if (arg === "--limit") args.limit = Number(argv[i + 1] || "100"), i += 1;
  }
  return args;
}

function changed(candidate, parsed) {
  const nextEventType = parsed.parsed ? "otp.extracted" : "mail.parse_failed";
  return (
    candidate.currentEventType !== nextEventType ||
    (candidate.currentOtpCode || null) !== (parsed.otpCode || null) ||
    (candidate.currentVerificationLink || null) !== (parsed.verificationLink || null)
  );
}

const runtimeConfig = createConfig(process.env);
const store = createStoreFromConfig(runtimeConfig);
const args = parseArgs(process.argv.slice(2));

if (typeof store.listMessagesForReparse !== "function") {
  console.error("Current storage backend does not support message reparse");
  process.exit(1);
}

const candidates = await store.listMessagesForReparse({
  tenantId: args.tenantId,
  messageId: args.messageId,
  limit: args.limit,
});

const inspected = [];
let updated = 0;

for (const item of candidates) {
  const parsed = parseInboundContent({
    subject: item.subject,
    textExcerpt: item.textExcerpt,
    htmlExcerpt: item.htmlExcerpt,
    htmlBody: item.htmlBody,
  });
  const needsUpdate = changed(item, parsed);
  const row = {
    message_id: item.messageId,
    current_event_type: item.currentEventType,
    current_otp_code: item.currentOtpCode,
    current_verification_link: item.currentVerificationLink,
    next_event_type: parsed.parsed ? "otp.extracted" : "mail.parse_failed",
    next_otp_code: parsed.otpCode,
    next_verification_link: parsed.verificationLink,
    needs_update: needsUpdate,
  };
  inspected.push(row);

  if (needsUpdate && args.apply) {
    await store.applyMessageParseResult({
      messageId: item.messageId,
      otpCode: parsed.otpCode,
      verificationLink: parsed.verificationLink,
      payload: {
        parser: "builtin",
        source: "reparse-script",
        parser_status: parsed.parserStatus,
      },
      requestId: "reparse-script",
    });
    updated += 1;
  }
}

console.log(JSON.stringify({
  apply: args.apply,
  scanned: candidates.length,
  updated,
  items: inspected,
}, null, 2));
