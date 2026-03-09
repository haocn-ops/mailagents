export function parsePaymentProofBody(body, paidBypassTargets) {
  const proofMethod = String(body.method || "").trim().toUpperCase();
  const proofPath = String(body.path || "").trim();

  if (!proofMethod || !proofPath) {
    return { ok: false, status: 400, message: "method and path are required" };
  }
  if (!paidBypassTargets.has(`${proofMethod} ${proofPath}`)) {
    return { ok: false, status: 400, message: "unsupported payment proof target" };
  }

  return {
    ok: true,
    proofMethod,
    proofPath,
  };
}

export function parseSiweChallengeBody(body) {
  const walletAddress = String(body.wallet_address || "").trim();
  if (!walletAddress) {
    return { ok: false, message: "wallet_address is required" };
  }
  return { ok: true, walletAddress };
}

export function parseSiweVerifyBody(body) {
  const message = String(body.message || "");
  const signature = String(body.signature || "");
  if (!message || !signature) {
    return { ok: false, message: "message and signature are required" };
  }
  return { ok: true, message, signature };
}
