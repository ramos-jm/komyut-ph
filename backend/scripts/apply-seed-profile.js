import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db/pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROFILE_MAP = {
  metro: "seed.sql",
  "qc-pasay": "seed_qc_pasay.sql"
};

function parseArgs() {
  const args = process.argv.slice(2);
  let profile = "metro";

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--profile" && args[i + 1]) {
      profile = args[i + 1].toLowerCase();
      i += 1;
    }
  }

  if (!PROFILE_MAP[profile]) {
    throw new Error(`Unknown profile: ${profile}. Valid profiles: ${Object.keys(PROFILE_MAP).join(", ")}`);
  }

  return { profile, fileName: PROFILE_MAP[profile] };
}

async function run() {
  const { profile, fileName } = parseArgs();
  const root = path.resolve(__dirname, "..", "..");
  const filePath = path.join(root, "db", fileName);

  const sql = await fs.readFile(filePath, "utf-8");
  await pool.query(sql);

  console.log(`Applied seed profile: ${profile}`);
}

run()
  .catch((error) => {
    console.error("Seed profile apply failed:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
