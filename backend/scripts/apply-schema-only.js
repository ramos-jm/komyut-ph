import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db/pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const root = path.resolve(__dirname, "..", "..");
  const schemaPath = path.join(root, "db", "schema.sql");
  const schemaSql = await fs.readFile(schemaPath, "utf-8");

  console.log("Applying schema only...");
  await pool.query(schemaSql);
  console.log("Schema apply complete.");
}

run()
  .catch((error) => {
    console.error("Schema apply failed:");
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
