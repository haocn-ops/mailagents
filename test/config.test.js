import test from "node:test";
import assert from "node:assert/strict";
import { createConfig } from "../src/config.js";
import { asBoolean, asCsvList, asLower, asNumber, asUpper } from "../src/config-parsers.js";

test("config primitive parsers normalize values and fall back safely", () => {
  assert.equal(asLower("MAILU", "noop"), "mailu");
  assert.equal(asUpper("bearer", "raw"), "BEARER");
  assert.equal(asNumber("42", 1), 42);
  assert.equal(asNumber("not-a-number", 7), 7);
  assert.equal(asBoolean("true", false), true);
  assert.equal(asBoolean(undefined, true), true);
});

test("config csv parser trims and filters empty values", () => {
  assert.deepEqual(asCsvList(" a, b ,, c ", []), ["a", "b", "c"]);
  assert.deepEqual(asCsvList(undefined, ["https://rpc.example"]), ["https://rpc.example"]);
});

test("createConfig uses extracted parsers for lists and booleans", () => {
  const config = createConfig({
    BASE_CHAIN_ID: "1",
    CHAIN_RPC_URLS: " https://rpc-1.example , https://rpc-2.example ",
    CHAIN_EXPLORER_URLS: " https://scan.example ",
    MAIL_SMTP_SECURE: "true",
    MAIL_PROVIDER: "MAILU",
    QUEUE_BACKEND: "REDIS",
  });

  assert.deepEqual(config.chainRpcUrls, ["https://rpc-1.example", "https://rpc-2.example"]);
  assert.deepEqual(config.chainExplorerUrls, ["https://scan.example"]);
  assert.equal(config.mailSmtpSecure, true);
  assert.equal(config.mailProvider, "mailu");
  assert.equal(config.queueBackend, "redis");
});
