/**
 * Transit Data Sync — grid-based Overpass import
 *
 * Usage:
 *   npm run sync-data
 *   npm run sync-data -- --region metro-manila-calabarzon --grid-lat 3 --grid-lng 4
 *
 * The grid splits the region into smaller cells so Overpass never receives a
 * query that's too large to answer.  For MM+CALABARZON we use a 3×4 = 12 cell
 * grid by default — each cell is roughly 35 km × 45 km.
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { pool } from "../src/db/pool.js";
import { resolveRegionConfig, REGION_CONFIG } from "../src/config/regions.js";
import { env } from "../src/config/env.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Helpers ──────────────────────────────────────────────────────────────
async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
}

function runCommand(cmd, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`\n  ▶  node ${args.join(" ")}`);
    const proc = spawn(cmd, args, { stdio: "inherit", shell: false });
    proc.on("close", (code) => (code !== 0 ? reject(new Error(`Exit ${code}`)) : resolve()));
    proc.on("error", reject);
  });
}

// Refresh the materialized view so the routing service gets fresh data
async function refreshGraphView() {
  console.log("\n  🔄  Refreshing route_graph_edges materialized view…");
  try {
    await pool.query("REFRESH MATERIALIZED VIEW CONCURRENTLY route_graph_edges;");
    console.log("      Done.");
  } catch (err) {
    // View might not exist yet on first run — that's fine, schema.sql creates it
    if (err.code === "42P01") {
      console.log("      View not found — run db/schema.sql first.");
    } else {
      console.warn("      Refresh failed (non-fatal):", err.message);
    }
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🔄  PH Commute Guide — Transit Data Sync");
  console.log("=========================================\n");

  await ensureDir(path.join(__dirname, "..", "logs"));

  const region = resolveRegionConfig(
    process.env.IMPORT_DEFAULT_REGION || env.importDefaultRegion,
    process.env.IMPORT_DEFAULT_BBOX || null
  );

  const importLimit  = Number(process.env.IMPORT_DEFAULT_LIMIT  || env.importDefaultLimit  || 500);
  const gridLat      = Number(process.env.IMPORT_GRID_LAT       || 3);
  const gridLng      = Number(process.env.IMPORT_GRID_LNG       || 4);

  console.log(`  Region  : ${region.regionKey}`);
  console.log(`  BBox    : ${region.bbox}`);
  console.log(`  Grid    : ${gridLat}×${gridLng} cells`);
  console.log(`  Limit   : ${importLimit} nodes/cell\n`);

  const importScript = path.join(__dirname, "import-overpass.js");

  const runImport = (regionKey, bbox) =>
    runCommand("node", [
      importScript,
      "--region",  regionKey,
      "--bbox",    bbox,
      "--limit",   String(importLimit),
      "--grid-lat", String(gridLat),
      "--grid-lng", String(gridLng)
    ]);

  try {
    await runImport(region.regionKey, region.bbox);
  } catch (primaryErr) {
    console.warn("\n⚠️   Primary import failed:", primaryErr.message);

    // Fall back: split combined region into two separate passes
    if (region.regionKey === "metro-manila-calabarzon") {
      const mm = REGION_CONFIG["metro-manila"]?.bbox;
      const cz = REGION_CONFIG.calabarzon?.bbox;

      if (mm && cz) {
        console.log("\n  ↺  Retrying as two separate passes…\n");
        try {
          await runImport("metro-manila", mm);
          await runImport("calabarzon",   cz);
        } catch (splitErr) {
          console.error("\n❌  Split retry also failed:", splitErr.message);
          console.log("\n💡  Try the Geofabrik importer instead:");
          console.log("      node scripts/import-geofabrik.js");
          process.exitCode = 1;
          return;
        }
      }
    } else {
      process.exitCode = 1;
      return;
    }
  }

  // Refresh materialized view for faster routing queries
  await refreshGraphView();

  console.log("\n✅  Sync complete!\n");
  console.log("   What was updated:");
  console.log("   ✓  OSM stops (jeepney, bus, UV express, train)");
  console.log("   ✓  Route relations and signboards");
  console.log("   ✓  Route geometry (shape points)");
  console.log("   ✓  Route graph edges view refreshed\n");
  console.log("   Tip: schedule this weekly in GitHub Actions");
  console.log("   (see .github/workflows/neon-overpass-sync.yml)\n");
}

main()
  .catch((err) => {
    console.error("\n❌  Sync failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => { await pool.end(); });
