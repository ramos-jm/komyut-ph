import { spawn } from "child_process";
import { promises as fs } from "fs";
import dotenv from "dotenv";
import { resolveRegionConfig } from "../src/config/regions.js";
import { env } from "../src/config/env.js";

dotenv.config();

async function ensureLogsDir() {
  try {
    await fs.mkdir("logs", { recursive: true });
  } catch (e) {
    // ignore
  }
}

function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`\n📍 Running: ${command} ${args.join(" ")}`);

    const proc = spawn(command, args, {
      stdio: "inherit",
      shell: true,
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed with code ${code}`));
      } else {
        resolve();
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

async function main() {
  console.log("🔄 Transit Data Sync - Overpass Only");
  console.log("=====================================");
  console.log("");

  try {
    // Ensure logs directory exists
    await ensureLogsDir();

    const region = resolveRegionConfig(env.importDefaultRegion, process.env.IMPORT_DEFAULT_BBOX || null);
    const importLimit = Number(process.env.IMPORT_DEFAULT_LIMIT || env.importDefaultLimit || 500);

    // Run import (from backend directory, so path is scripts/import-overpass.js)
    console.log("📍 Importing latest data from OpenStreetMap...");
    await runCommand("node", [
      "scripts/import-overpass.js",
      "--region",
      region.regionKey,
      "--bbox",
      region.bbox,
      "--limit",
      String(importLimit)
    ]);

    console.log("");
    console.log("✅ Data sync complete!");
    console.log("");
    console.log("Summary:");
    console.log("  - OSM data imported (routes, stops, geometry)");
    console.log("  - Log saved to: logs/import.log");
    console.log("");
    console.log("Your database now has:");
    console.log("  ✓ Latest stops from OSM");
    console.log("  ✓ Latest routes from OSM");
    console.log("  ✓ Latest route geometry (shapes)");
    console.log("  ✓ Complete stop-to-stop connectivity");

  } catch (error) {
    console.error("\n❌ Sync failed:", error.message);
    process.exitCode = 1;
  }
}

main();
