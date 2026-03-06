import { config } from "../src/config.js";
import { createMailBackendAdapter } from "../src/mail-backend/index.js";
import { createStoreFromConfig } from "../src/store.js";
import { reconcileMailboxes } from "../src/reconcile.js";

async function main() {
  const repair = process.argv.includes("--repair");
  const store = createStoreFromConfig(config);
  const mailBackend = createMailBackendAdapter(config);
  const result = await reconcileMailboxes({ store, mailBackend, repair });

  console.log(JSON.stringify(result, null, 2));
  if (result.findings.length > 0) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(`reconcile-mailboxes failed: ${err.message}`);
  process.exit(1);
});
