import { createApp } from "./app.js";
import { runStartupPreflight } from "./bootstrap.js";
import { config } from "./config.js";
import { createHttpServer, logStartupWarnings, startHttpServer } from "./server-runtime.js";

const app = createApp();
const server = createHttpServer(app);

const preflight = runStartupPreflight(config);
logStartupWarnings(preflight);
startHttpServer(server, config.port);
