import process from "node:process";

function normalizeAddress(address) {
  return String(address || "").trim().toLowerCase();
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  let pg;
  try {
    pg = await import("pg");
  } catch {
    throw new Error("Missing dependency 'pg'. Run: npm install");
  }

  const { Client } = pg.default || pg;
  const client = new Client({ connectionString: databaseUrl });

  const chainId = Number(process.env.BASE_CHAIN_ID || 84532);
  const walletAddress = normalizeAddress(
    process.env.SEED_WALLET_ADDRESS || "0xabc0000000000000000000000000000000000123",
  );
  const tenantName = process.env.SEED_TENANT_NAME || `seed-${walletAddress.slice(2, 8)}`;
  const agentName = process.env.SEED_AGENT_NAME || "seed-agent";
  const mailboxCount = Math.max(1, Number(process.env.SEED_MAILBOX_COUNT || 5));
  const did = `did:pkh:eip155:${chainId}:${walletAddress}`;

  await client.connect();
  try {
    await client.query("BEGIN");

    const identityResult = await client.query(
      `select tenant_id from wallet_identities where chain_id = $1 and address = $2 limit 1`,
      [chainId, walletAddress],
    );

    let tenantId;
    if (identityResult.rowCount > 0) {
      tenantId = identityResult.rows[0].tenant_id;
    } else {
      const tenantResult = await client.query(
        `insert into tenants(name) values ($1) returning id`,
        [tenantName],
      );
      tenantId = tenantResult.rows[0].id;

      await client.query(
        `insert into wallet_identities (tenant_id, chain_id, address, did, is_primary)
         values ($1, $2, $3, $4, true)`,
        [tenantId, chainId, walletAddress, did],
      );
    }

    const agentResult = await client.query(
      `select id from agents where tenant_id = $1 order by created_at asc limit 1`,
      [tenantId],
    );

    let agentId;
    if (agentResult.rowCount > 0) {
      agentId = agentResult.rows[0].id;
    } else {
      const createdAgent = await client.query(
        `insert into agents (tenant_id, name) values ($1, $2) returning id`,
        [tenantId, agentName],
      );
      agentId = createdAgent.rows[0].id;
    }

    for (let i = 0; i < mailboxCount; i += 1) {
      const address = `${walletAddress.slice(2, 8)}-seed-${i + 1}@pool.mailcloud.local`;
      await client.query(
        `insert into mailboxes (tenant_id, address, status)
         values ($1, $2, 'available')
         on conflict(address) do nothing`,
        [tenantId, address],
      );
    }

    const monthStart = new Date();
    const start = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1));
    const end = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));

    const periodStart = start.toISOString().slice(0, 10);
    const periodEnd = end.toISOString().slice(0, 10);
    const invoiceExists = await client.query(
      `select id from invoices where tenant_id = $1 and period_start = $2 and period_end = $3 limit 1`,
      [tenantId, periodStart, periodEnd],
    );
    if (invoiceExists.rowCount === 0) {
      await client.query(
        `insert into invoices (tenant_id, period_start, period_end, amount_usdc, status)
         values ($1, $2, $3, 0, 'draft')`,
        [tenantId, periodStart, periodEnd],
      );
    }

    await client.query("COMMIT");

    console.log("Seed completed:");
    console.log(`  tenant_id=${tenantId}`);
    console.log(`  agent_id=${agentId}`);
    console.log(`  wallet_address=${walletAddress}`);
    console.log(`  did=${did}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`db:seed failed: ${err.message}`);
  process.exit(1);
});
