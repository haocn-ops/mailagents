export function jsonResponse(status, payload, requestId) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "x-request-id": requestId,
  });
  return new Response(JSON.stringify(payload), { status, headers });
}

export function parsePaging(requestUrl) {
  const page = Number(requestUrl.searchParams.get("page") || "1");
  const pageSize = Number(requestUrl.searchParams.get("page_size") || "20");
  if (!Number.isInteger(page) || page < 1) {
    return { ok: false, message: "page must be >= 1" };
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) {
    return { ok: false, message: "page_size must be 1..200" };
  }
  return { ok: true, page, pageSize };
}

export function chargeRequiredResponse(requestId, amountUsdc, reasons) {
  return jsonResponse(
    402,
    {
      error: "payment_required",
      message: "Free limit reached; payment is required to continue",
      amount_usdc: amountUsdc,
      reasons,
    },
    requestId,
  );
}

export async function readJsonBody(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON");
  }
}
