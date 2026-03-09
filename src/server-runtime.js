import { createServer } from "node:http";

export function logStartupWarnings(preflight, logger = console) {
  if (!preflight?.enforced || !preflight.warnings?.length) return;
  for (const warning of preflight.warnings) {
    logger.warn(`[startup-preflight] ${warning}`);
  }
}

export function createHttpServer(app) {
  return createServer(app);
}

export function startHttpServer(server, port, logger = console) {
  server.listen(port, () => {
    logger.log(`Agent Mail Cloud API listening on http://localhost:${port}`);
  });
  return server;
}
