import process from "node:process";
import { createSiweService } from "../src/siwe.js";

async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const signature = process.env.SIWE_SIGNATURE || "";
  const expectedAddress = (process.env.SIWE_ADDRESS || "").toLowerCase();
  const expectedNonce = process.env.SIWE_NONCE || "";
  const messageFromEnv = process.env.SIWE_MESSAGE || "";
  const mode = (process.env.SIWE_MODE || "strict").toLowerCase();

  const message = messageFromEnv || (await readStdin()).trim();

  if (!message) {
    throw new Error("SIWE_MESSAGE (or stdin message) is required");
  }
  if (!signature) {
    throw new Error("SIWE_SIGNATURE is required");
  }

  const siwe = createSiweService({
    mode,
    chainId: Number(process.env.BASE_CHAIN_ID || 84532),
    domain: process.env.SIWE_DOMAIN || "localhost",
    uri: process.env.SIWE_URI || "http://localhost",
    statement: process.env.SIWE_STATEMENT || "Sign in to Agent Mail Cloud",
  });

  const parsed = await siwe.parseMessage(message);
  const result = await siwe.verifySignature({
    message,
    signature,
    expectedAddress: expectedAddress || parsed.address,
    expectedNonce: expectedNonce || parsed.nonce,
  });

  if (!result.ok) {
    console.error(`SIWE verify failed: ${result.message || "unknown error"}`);
    process.exit(1);
  }

  console.log("SIWE verify success");
  console.log(`  address=${parsed.address}`);
  console.log(`  nonce=${parsed.nonce}`);
}

main().catch((err) => {
  console.error(`siwe:verify failed: ${err.message}`);
  process.exit(1);
});
