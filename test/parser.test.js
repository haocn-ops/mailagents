import test from "node:test";
import assert from "node:assert/strict";
import { parseInboundContent } from "../src/parser.js";

test("parser extracts numeric otp from 'verification code is' phrasing", () => {
  const parsed = parseInboundContent({
    subject: "Complete sign in",
    textExcerpt: "Your verification code is 482913\nVerify here: https://example.com/verify?token=abc",
  });

  assert.equal(parsed.otpCode, "482913");
  assert.equal(parsed.verificationLink, "https://example.com/verify?token=abc");
  assert.equal(parsed.parserStatus, "parsed");
});
