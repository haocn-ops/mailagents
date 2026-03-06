import { createFetchApp } from "./fetch-app.js";

async function readIncomingBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      const buf = Buffer.from(chunk);
      chunks.push(buf);
      size += buf.length;
      if (size > 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function writeResponse(res, response) {
  const headerEntries = {};
  response.headers.forEach((value, key) => {
    headerEntries[key] = value;
  });

  if (typeof res.writeHead === "function") {
    res.writeHead(response.status, headerEntries);
  } else {
    res.statusCode = response.status;
    Object.entries(headerEntries).forEach(([key, value]) => {
      if (typeof res.setHeader === "function") {
        res.setHeader(key, value);
      }
    });
  }

  if (!response.body) {
    res.end();
    return;
  }

  response
    .arrayBuffer()
    .then((ab) => {
      res.end(Buffer.from(ab));
    })
    .catch(() => {
      res.statusCode = 500;
      if (typeof res.setHeader === "function") {
        res.setHeader("content-type", "application/json; charset=utf-8");
      } else if (typeof res.writeHead === "function") {
        res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      }
      res.end(JSON.stringify({ error: "internal_error", message: "Failed to render response" }));
    });
}

export function createApp(deps = {}) {
  const fetchHandler = deps.fetchApp || createFetchApp(deps);

  return async function app(req, res) {
    try {
      const method = req.method || "GET";
      const host = req.headers.host || "localhost";
      const url = `http://${host}${req.url || "/"}`;

      const headers = new Headers();
      Object.entries(req.headers || {}).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          headers.set(key, value.join(","));
        } else if (value !== undefined) {
          headers.set(key, String(value));
        }
      });

      const bodyBuffer = ["GET", "HEAD"].includes(method) ? null : await readIncomingBody(req);
      const request = new Request(url, {
        method,
        headers,
        body: bodyBuffer,
      });

      const response = await fetchHandler(request);
      writeResponse(res, response);
    } catch (err) {
      const status = err.message === "Payload too large" ? 413 : 500;
      if (typeof res.writeHead === "function") {
        res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
      } else {
        res.statusCode = status;
        if (typeof res.setHeader === "function") {
          res.setHeader("content-type", "application/json; charset=utf-8");
        }
      }
      res.end(
        JSON.stringify({
          error: status === 413 ? "payload_too_large" : "internal_error",
          message: err.message || "Unexpected error",
        }),
      );
    }
  };
}
