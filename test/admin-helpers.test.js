import test from "node:test";
import assert from "node:assert/strict";
import { createAdminResponses } from "../src/admin/responses.js";
import {
  parseAdminBucket,
  parseAdminPathParam,
  parseLimitSettingsPatch,
  parseMailboxFreezeBody,
  parseRiskPolicyBody,
} from "../src/admin/validation.js";

test("admin validation parses path params and buckets", () => {
  assert.deepEqual(
    parseAdminPathParam("/v1/admin/messages/msg_1/reparse", {
      prefix: "/v1/admin/messages/",
      suffix: "/reparse",
      name: "message_id",
    }),
    { ok: true, value: "msg_1" },
  );
  assert.deepEqual(parseAdminBucket("day"), { ok: true, value: "day" });
  assert.equal(parseAdminBucket("week").ok, false);
});

test("admin validation parses settings, freeze, and risk policy bodies", () => {
  assert.deepEqual(
    parseLimitSettingsPatch(
      {
        overage_charge_usdc: "0.5",
        agent_allocate_hourly_limit: "10",
      },
      {
        overageChargeUsdc: 0.25,
        agentAllocateHourlyLimit: 5,
      },
    ),
    {
      ok: true,
      overageChargeUsdc: 0.5,
      agentAllocateHourlyLimit: 10,
    },
  );
  assert.deepEqual(parseMailboxFreezeBody({ reason: "abuse" }), { ok: true, reason: "abuse" });
  assert.deepEqual(parseRiskPolicyBody({ policy_type: "sender_domain", value: "example.com", action: "block" }), {
    ok: true,
    policyType: "sender_domain",
    value: "example.com",
    action: "block",
  });
  assert.equal(parseRiskPolicyBody({}).ok, false);
});

test("admin responses map common success and error shapes", () => {
  const responses = createAdminResponses({
    jsonResponse(status, payload, requestId) {
      return { status, payload, requestId };
    },
  });

  assert.deepEqual(responses.ok("req_1", { status: "ok" }), {
    status: 200,
    payload: { status: "ok" },
    requestId: "req_1",
  });
  assert.deepEqual(responses.accepted("req_2", { status: "queued" }), {
    status: 202,
    payload: { status: "queued" },
    requestId: "req_2",
  });
  assert.deepEqual(responses.notFound("req_3", "Mailbox not found"), {
    status: 404,
    payload: { error: "not_found", message: "Mailbox not found" },
    requestId: "req_3",
  });
});
