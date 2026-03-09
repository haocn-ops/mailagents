export async function readIncomingBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      const buf = Buffer.from(chunk);
      chunks.push(buf);
      size += buf.length;
      if (size > maxBytes) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function writeNodeResponse(res, response) {
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

export function createNodeRequest(req, { baseUrl = "http://localhost" } = {}) {
  const method = req.method || "GET";
  const host = req.headers.host || new URL(baseUrl).host || "localhost";
  const url = `${new URL(baseUrl).protocol}//${host}${req.url || "/"}`;

  const headers = new Headers();
  Object.entries(req.headers || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      headers.set(key, value.join(","));
    } else if (value !== undefined) {
      headers.set(key, String(value));
    }
  });

  return { method, headers, url };
}

export function writeNodeError(res, err) {
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
