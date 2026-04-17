#!/usr/bin/env node
/**
 * Geofabrik PBF Importer (alternative to Overpass when it's flaky)
 *
 * Requirements:
 *   apt-get install osmium-tool   # Ubuntu/Debian
 *   brew install osmium-tool      # macOS
 *
 * What it does:
 *   1. Downloads Philippines OSM data from Geofabrik (~120 MB, free)
 *   2. Clips to Metro Manila + CALABARZON bbox
 *   3. Exports public transport nodes and route relations as GeoJSON
 *   4. Imports into your PostgreSQL database
 *
 * Usage:
 *   node scripts/import-geofabrik.js
 *   node scripts/import-geofabrik.js --bbox "13.80,120.55,14.83,122.10"
 *   node scripts/import-geofabrik.js --skip-download   # reuse existing PBF
 *   node scripts/import-geofabrik.js --progress-every 500
 */

import { execSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool, withTransaction } from "../src/db/pool.js";
import { env } from "../src/config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORK_DIR = path.join(__dirname, "..", ".cache", "osm");

// ─── Config ────────────────────────────────────────────────────────────────
const PH_PBF_URL = "https://download.geofabrik.de/asia/philippines-latest.osm.pbf";
const PH_PBF = path.join(WORK_DIR, "philippines-latest.osm.pbf");
const CLIP_PBF = path.join(WORK_DIR, "mm-calabarzon.osm.pbf");
const STOPS_GEOJSON = path.join(WORK_DIR, "stops.geojson");
const ROUTES_GEOJSON = path.join(WORK_DIR, "routes.geojson");

function parseArgs() {
  const args = process.argv.slice(2);
  const progressEveryRaw = args[args.indexOf("--progress-every") + 1];
  const progressEvery = Number(progressEveryRaw || 500);
  return {
    skipDownload: args.includes("--skip-download"),
    bbox: args[args.indexOf("--bbox") + 1] || env.importDefaultBbox || "13.80,120.55,14.83,122.10",
    progressEvery: Number.isFinite(progressEvery) && progressEvery > 0 ? Math.floor(progressEvery) : 500
  };
}

function run(cmd, desc) {
  console.log(`  ⚙️  ${desc}`);
  const result = spawnSync(cmd, { shell: true, stdio: "pipe", encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${cmd}\n${result.stderr}`);
  }
  return result.stdout;
}

function checkOsmium() {
  const r = spawnSync("osmium", ["--version"], { stdio: "pipe" });
  if (r.status !== 0) {
    console.error(`
❌  osmium-tool is not installed.

Install it first:
  Ubuntu/Debian : sudo apt-get install osmium-tool
  macOS         : brew install osmium-tool
  Windows       : https://osmcode.org/osmium-tool/

Then re-run this script.
`);
    process.exit(1);
  }
}

// ─── Type helpers ──────────────────────────────────────────────────────────
function stopTypeFromTags(tags = {}) {
  if (tags.railway === "station" || tags.railway === "halt") return "train";
  if (/uv|fx/i.test(tags.name || "")) return "uv";
  if (/jeep|jeepney/i.test(tags.name || "") || /jeep|jeepney/i.test(tags.network || "")) return "jeep";
  return "bus";
}

function routeTypeFromTags(tags = {}) {
  const r = (tags.route || "").toLowerCase();
  if (["subway", "light_rail", "train", "tram"].includes(r)) return "train";
  if (r === "jeepney") return "jeep";
  if (/uv|fx/i.test(tags.name || "")) return "uv";
  return "bus";
}

function normalizeSignboard(tags = {}) {
  if (tags.from && tags.to) return `${tags.from}-${tags.to}`;
  return tags.ref || tags.name || "No signboard";
}

// ─── Import from GeoJSON ───────────────────────────────────────────────────
async function importStops(geojsonPath, progressEvery = 500) {
  const raw = readFileSync(geojsonPath, "utf-8");
  const fc = JSON.parse(raw);
  const features = fc.features || [];
  console.log(`  📍  Importing ${features.length} stop features…`);

  let inserted = 0;
  let updated = 0;
  let processed = 0;

  await withTransaction(async (client) => {
    for (const feat of features) {
      if (feat.geometry?.type !== "Point") continue;
      const [lon, lat] = feat.geometry.coordinates;
      const tags = feat.properties || {};
      const name = tags.name || tags.ref || `Stop ${tags["@id"] || "?"}`;
      const type = stopTypeFromTags(tags);

      const existing = await client.query(
        `SELECT id FROM stops WHERE name=$1 AND ABS(latitude-$2)<0.00005 AND ABS(longitude-$3)<0.00005 LIMIT 1;`,
        [name, lat, lon]
      );
      if (existing.rows[0]) {
        await client.query(
          "UPDATE stops SET name=$2,latitude=$3,longitude=$4,type=$5 WHERE id=$1;",
          [existing.rows[0].id, name, lat, lon, type]
        );
        updated++;
      } else {
        await client.query(
          "INSERT INTO stops (name,latitude,longitude,type) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING;",
          [name, lat, lon, type]
        );
        inserted++;
      }

      processed++;
      if (processed % progressEvery === 0) {
        console.log(`     …processed ${processed}/${features.length} stops (new: ${inserted}, updated: ${updated})`);
      }
    }
  });

  console.log(`     +${inserted} new, ~${updated} updated`);
  return inserted + updated;
}

async function importRoutes(geojsonPath, progressEvery = 500) {
  const raw = readFileSync(geojsonPath, "utf-8");
  const fc = JSON.parse(raw);
  const features = fc.features || [];
  console.log(`  🛣️  Importing ${features.length} route features…`);

  let routesInserted = 0;
  let shapePointsTotal = 0;
  let processedRelations = 0;
  let totalRouteCandidates = 0;

  for (const feat of features) {
    if (feat.geometry?.type !== "LineString" && feat.geometry?.type !== "MultiLineString") continue;
    const tags = feat.properties || {};
    if (tags["@type"] !== "relation") continue;
    totalRouteCandidates++;
  }

  await withTransaction(async (client) => {
    for (const feat of features) {
      if (feat.geometry?.type !== "LineString" && feat.geometry?.type !== "MultiLineString") continue;
      const tags = feat.properties || {};
      if (tags["@type"] !== "relation") continue;

      const name = tags.name || tags.ref || `Route ${tags["@id"] || "?"}`;
      const type = routeTypeFromTags(tags);
      const signboard = normalizeSignboard(tags);

      const existing = await client.query(
        "SELECT id FROM routes WHERE name=$1 AND signboard=$2 LIMIT 1;",
        [name, signboard]
      );

      let routeId;
      if (existing.rows[0]) {
        routeId = existing.rows[0].id;
        await client.query("UPDATE routes SET type=$2 WHERE id=$1;", [routeId, type]);
      } else {
        const ins = await client.query(
          "INSERT INTO routes (name,type,signboard) VALUES ($1,$2,$3) RETURNING id;",
          [name, type, signboard]
        );
        routeId = ins.rows[0]?.id;
        if (routeId) routesInserted++;
      }
      if (!routeId) continue;

      // Build shape coordinates from GeoJSON geometry
      let shapeCoords = [];
      if (feat.geometry.type === "LineString") {
        shapeCoords = feat.geometry.coordinates; // already [lon,lat]
      } else if (feat.geometry.type === "MultiLineString") {
        // Concatenate line segments
        for (const line of feat.geometry.coordinates) {
          for (const coord of line) {
            const last = shapeCoords[shapeCoords.length - 1];
            if (!last || last[0] !== coord[0] || last[1] !== coord[1]) {
              shapeCoords.push(coord);
            }
          }
        }
      }

      if (shapeCoords.length >= 2) {
        await client.query("DELETE FROM route_shape_points WHERE route_id=$1;", [routeId]);
        for (let seq = 1; seq <= shapeCoords.length; seq++) {
          const [lon, lat] = shapeCoords[seq - 1];
          await client.query(
            `INSERT INTO route_shape_points (route_id,seq,latitude,longitude)
             VALUES ($1,$2,$3,$4) ON CONFLICT (route_id,seq) DO UPDATE
             SET latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude;`,
            [routeId, seq, lat, lon]
          );
          shapePointsTotal++;
        }
      }

      processedRelations++;
      if (processedRelations % progressEvery === 0) {
        console.log(
          `     …processed ${processedRelations}/${totalRouteCandidates} routes ` +
          `(new: ${routesInserted}, shape points: ${shapePointsTotal})`
        );
      }
    }
  });

  console.log(`     ${routesInserted} new routes, ${shapePointsTotal} shape points`);
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs();
  checkOsmium();
  mkdirSync(WORK_DIR, { recursive: true });

  console.log("\n🌍  PH Commute Guide — Geofabrik Importer");
  console.log(`   Bbox: ${args.bbox}\n`);
  console.log(`   Progress: every ${args.progressEvery} records\n`);

  // Convert "minLat,minLng,maxLat,maxLng" → osmium's "minLng,minLat,maxLng,maxLat"
  const [minLat, minLng, maxLat, maxLng] = args.bbox.split(",").map(Number);
  const osmiumBbox = `${minLng},${minLat},${maxLng},${maxLat}`;

  // ── 1. Download ───────────────────────────────────────────────────────
  if (!args.skipDownload || !existsSync(PH_PBF)) {
    console.log("📥  Downloading Philippines OSM data (~120 MB)…");
    run(`curl -L -o "${PH_PBF}" "${PH_PBF_URL}"`, "curl download");
    console.log("    Download complete.\n");
  } else {
    console.log("⏭️   Skipping download (--skip-download).\n");
  }

  // ── 2. Clip to bbox ───────────────────────────────────────────────────
  console.log("✂️   Clipping to Metro Manila + CALABARZON…");
  run(
    `osmium extract --bbox="${osmiumBbox}" --overwrite "${PH_PBF}" -o "${CLIP_PBF}"`,
    "osmium extract"
  );

  // ── 3. Export stops as GeoJSON ────────────────────────────────────────
  console.log("\n📌  Exporting stop nodes…");
  run(
    [
      `osmium tags-filter "${CLIP_PBF}"`,
      `n/highway=bus_stop`,
      `n/public_transport=stop_position`,
      `n/public_transport=platform`,
      `n/railway=station`,
      `n/railway=halt`,
      `n/amenity=bus_station`,
      `--overwrite -o "${WORK_DIR}/stops-raw.osm.pbf"`
    ].join(" "),
    "filter stops"
  );
  run(
    `osmium export --overwrite "${WORK_DIR}/stops-raw.osm.pbf" -o "${STOPS_GEOJSON}"`,
    "export stops GeoJSON"
  );

  // ── 4. Export route relations as GeoJSON ─────────────────────────────
  console.log("\n🛣️   Exporting route relations…");
  run(
    [
      `osmium tags-filter "${CLIP_PBF}"`,
      `r/route=bus r/route=jeepney r/route=share_taxi`,
      `r/route=subway r/route=light_rail r/route=train r/route=tram r/route=ferry`,
      `--overwrite -o "${WORK_DIR}/routes-raw.osm.pbf"`
    ].join(" "),
    "filter routes"
  );
  run(
    `osmium export --overwrite --geometry-types=linestring "${WORK_DIR}/routes-raw.osm.pbf" -o "${ROUTES_GEOJSON}"`,
    "export routes GeoJSON"
  );

  // ── 5. Import into PostgreSQL ─────────────────────────────────────────
  console.log("\n🗄️   Importing into database…");
  await importStops(STOPS_GEOJSON, args.progressEvery);
  await importRoutes(ROUTES_GEOJSON, args.progressEvery);

  console.log("\n✅  Geofabrik import complete!");
  console.log("   Cache files saved in backend/.cache/osm/");
  console.log("   Re-run with --skip-download to reimport without re-downloading.\n");
}

main()
  .catch((err) => {
    console.error("\n❌  Import failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => { await pool.end(); });
