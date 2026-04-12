import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db/pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const root = path.resolve(__dirname, "..", "..");
  const schemaPath = path.join(root, "db", "schema.sql");
  const seedPath = path.join(root, "db", "seed.sql");

  const schemaSql = await fs.readFile(schemaPath, "utf-8");
  const seedSql = await fs.readFile(seedPath, "utf-8");

  console.log("Applying schema...");
  await pool.query(schemaSql);

  console.log("Applying seed data...");
  await pool.query(seedSql);

  console.log("Database setup complete.");
}

run()
  .catch((error) => {
    console.error("Database setup failed:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
