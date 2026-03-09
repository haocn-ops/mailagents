import { createFetchApp } from "./fetch-app.js";
import { createNodeRequest, readIncomingBody, writeNodeError, writeNodeResponse } from "./node-http-bridge.js";

export function createApp(deps = {}) {
  const fetchHandler = deps.fetchApp || createFetchApp(deps);

  return async function app(req, res) {
    try {
      const { method, headers, url } = createNodeRequest(req);
      const bodyBuffer = ["GET", "HEAD"].includes(method) ? null : await readIncomingBody(req);
      const request = new Request(url, {
        method,
        headers,
        body: bodyBuffer,
      });

      const response = await fetchHandler(request);
      writeNodeResponse(res, response);
    } catch (err) {
      writeNodeError(res, err);
    }
  };
}
