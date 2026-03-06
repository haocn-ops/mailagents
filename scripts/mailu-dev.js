#!/usr/bin/env node
import { createServer } from "node:http";
import { createApp } from "../src/app.js";
import { createMailuDevApp } from "../src/mailu-dev-app.js";

const port = Number(process.env.MAILU_DEV_PORT || 3001);

const app = createApp({
  fetchApp: createMailuDevApp({
    apiToken: process.env.MAILU_API_TOKEN || "change-me",
    authScheme: process.env.MAILU_AUTH_SCHEME || "BEARER",
    agentsBaseUrl: process.env.AGENTS_BASE_URL || "http://localhost:3000",
    internalApiToken: process.env.INTERNAL_API_TOKEN || "",
  }),
});

const server = createServer(app);
server.listen(port, () => {
  console.log(`mailu-dev listening on http://localhost:${port}`);
});
