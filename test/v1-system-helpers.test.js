import test from "node:test";
import assert from "node:assert/strict";
import { createV1SystemResponses } from "../src/v1/system-responses.js";
import {
  parsePaymentProofBody,
  parseSiweChallengeBody,
  parseSiweVerifyBody,
} from "../src/v1/system-validation.js";

test("v1 system validation parses payment proof target", () => {
  const paidBypassTargets = new Set(["POST /v1/messages/send"]);
  assert.deepEqual(
    parsePaymentProofBody({ method: "post", path: "/v1/messages/send" }, paidBypassTargets),
    {
      ok: true,
      proofMethod: "POST",
      proofPath: "/v1/messages/send",
    },
  );
  assert.equal(parsePaymentProofBody({}, paidBypassTargets).ok, false);
  assert.equal(parsePaymentProofBody({ method: "POST", path: "/v1/mailboxes" }, paidBypassTargets).ok, false);
});

test("v1 system validation parses SIWE request bodies", () => {
  assert.deepEqual(parseSiweChallengeBody({ wallet_address: "0xabc" }), { ok: true, walletAddress: "0xabc" });
  assert.deepEqual(parseSiweVerifyBody({ message: "m", signature: "s" }), {
    ok: true,
    message: "m",
    signature: "s",
  });
  assert.equal(parseSiweChallengeBody({}).ok, false);
  assert.equal(parseSiweVerifyBody({}).ok, false);
});

test("v1 system responses map common response shapes", () => {
  const responses = createV1SystemResponses({
    jsonResponse(status, payload, requestId) {
      return { status, payload, requestId };
    },
  });

  assert.deepEqual(responses.ok("req_1", { access_token: "tok" }), {
    status: 200,
    payload: { access_token: "tok" },
    requestId: "req_1",
  });
  assert.deepEqual(responses.unauthorized("req_2", "invalid signature"), {
    status: 401,
    payload: { error: "unauthorized", message: "invalid signature" },
    requestId: "req_2",
  });
});
