#!/usr/bin/env node
import process from "node:process";
import { syncMailuMaildir } from "../src/mailu-sync.js";

const mailRoot = process.env.MAILU_MAIL_ROOT || "/mailu/mail";
const stateFile = process.env.MAILU_SYNC_STATE_FILE || "/mailu/config/mailagents-sync-state.json";
const agentsBaseUrl = process.env.AGENTS_BASE_URL || "http://127.0.0.1:3000";
const internalApiToken = process.env.INTERNAL_API_TOKEN || "";

syncMailuMaildir({
  mailRoot,
  stateFile,
  agentsBaseUrl,
  internalApiToken,
}).then((result) => {
  console.log(JSON.stringify(result));
}).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
