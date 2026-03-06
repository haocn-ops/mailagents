import { createServer } from "node:http";
import { createApp } from "./app.js";
import { runStartupPreflight } from "./bootstrap.js";
import { config } from "./config.js";

const app = createApp();
const server = createServer(app);

const preflight = runStartupPreflight(config);
if (preflight.enforced && preflight.warnings.length) {
  for (const warning of preflight.warnings) {
    console.warn(`[startup-preflight] ${warning}`);
  }
}

server.listen(config.port, () => {
  console.log(`Agent Mail Cloud API listening on http://localhost:${config.port}`);
});
