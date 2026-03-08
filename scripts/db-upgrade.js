#!/usr/bin/env node
import process from "node:process";

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
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query(`alter table webhooks add column if not exists secret_enc text`);
    await client.query(`
      create table if not exists app_settings (
        key text primary key,
        value jsonb not null,
        updated_at timestamptz not null default now()
      )
    `);
    await client.query(`
      create unique index if not exists idx_messages_mailbox_provider_message
      on messages(mailbox_id, provider_message_id)
      where provider_message_id is not null
    `);
    await client.query("COMMIT");
    console.log("Database upgrade applied");
    console.log("Note: existing webhooks without secret_enc should have their secrets rotated.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`db:upgrade failed: ${err.message}`);
  process.exit(1);
});
