import { readFile } from "node:fs/promises";
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

  const schemaPath = process.env.DB_SCHEMA_PATH || "docs/db/schema.sql";
  const sql = await readFile(schemaPath, "utf8");

  await client.connect();
  try {
    await client.query(sql);
    console.log(`Applied schema from ${schemaPath}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`db:migrate failed: ${err.message}`);
  process.exit(1);
});
