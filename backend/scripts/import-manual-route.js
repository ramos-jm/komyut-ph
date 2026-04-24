import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withTransaction, pool } from "../src/db/pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  const entries = new Map();
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    const value = args[i + 1];
    if (key?.startsWith("--") && value && !value.startsWith("--")) {
      entries.set(key.slice(2), value);
      i += 1;
    }
  }

  const input = entries.get("input") || path.resolve(__dirname, "..", "data", "manual-routes", "pitx-sm-fairview.generated.json");
  return { input };
}

async function upsertStop(client, checkpoint, mode) {
  const existing = await client.query(
    `SELECT id FROM stops
     WHERE name = $1
       AND ABS(latitude - $2) < 0.0002
       AND ABS(longitude - $3) < 0.0002
     LIMIT 1;`,
    [checkpoint.name, checkpoint.latitude, checkpoint.longitude]
  );

  if (existing.rows[0]?.id) {
    return Number(existing.rows[0].id);
  }

  const type = ["jeep", "bus", "train", "uv"].includes(mode) ? mode : "bus";
  const ins = await client.query(
    `INSERT INTO stops (name, latitude, longitude, type)
     VALUES ($1,$2,$3,$4)
     RETURNING id;`,
    [checkpoint.name, checkpoint.latitude, checkpoint.longitude, type]
  );

  return Number(ins.rows[0].id);
}

async function run() {
  const { input } = parseArgs();
  const raw = await fs.readFile(input, "utf-8");
  const spec = JSON.parse(raw);

  if (!spec.routeName || !spec.signboard || !spec.mode) {
    throw new Error("Input must include routeName, signboard, and mode");
  }
  if (!Array.isArray(spec.checkpoints) || spec.checkpoints.length < 2) {
    throw new Error("Input must include at least 2 checkpoints");
  }
  if (!Array.isArray(spec.shapeCoordinates) || spec.shapeCoordinates.length < 2) {
    throw new Error("Input must include generated shapeCoordinates");
  }

  let routeId = null;

  await withTransaction(async (client) => {
    const routeRes = await client.query(
      `SELECT id FROM routes
       WHERE name=$1 AND signboard=$2
       LIMIT 1;`,
      [spec.routeName, spec.signboard]
    );

    if (routeRes.rows[0]?.id) {
      routeId = Number(routeRes.rows[0].id);
      await client.query(
        `UPDATE routes
         SET type = $2
         WHERE id = $1;`,
        [routeId, spec.mode]
      );
    } else {
      const ins = await client.query(
        `INSERT INTO routes (name, type, signboard)
         VALUES ($1,$2,$3)
         RETURNING id;`,
        [spec.routeName, spec.mode, spec.signboard]
      );
      routeId = Number(ins.rows[0].id);
    }

    await client.query("DELETE FROM route_stops WHERE route_id=$1;", [routeId]);
    await client.query("DELETE FROM route_shape_points WHERE route_id=$1;", [routeId]);

    let stopOrder = 1;
    for (const checkpoint of spec.checkpoints) {
      const stopId = await upsertStop(client, checkpoint, spec.mode);
      await client.query(
        `INSERT INTO route_stops (route_id, stop_id, stop_order)
         VALUES ($1,$2,$3)
         ON CONFLICT (route_id, stop_id) DO NOTHING;`,
        [routeId, stopId, stopOrder]
      );
      stopOrder += 1;
    }

    for (let i = 0; i < spec.shapeCoordinates.length; i += 1) {
      const [lon, lat] = spec.shapeCoordinates[i];
      await client.query(
        `INSERT INTO route_shape_points (route_id, seq, latitude, longitude)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (route_id, seq) DO UPDATE
         SET latitude = EXCLUDED.latitude,
             longitude = EXCLUDED.longitude;`,
        [routeId, i + 1, lat, lon]
      );
    }
  });

  try {
    await pool.query("SET lock_timeout = '5s';");
    await pool.query("SET statement_timeout = '20s';");
    await pool.query("REFRESH MATERIALIZED VIEW CONCURRENTLY route_graph_edges;");
  } catch (error) {
    console.warn(`Manual route import: skipped immediate graph refresh due to lock contention (${error.message}).`);
    console.warn("Run REFRESH MATERIALIZED VIEW CONCURRENTLY route_graph_edges after active ingest jobs finish.");
  } finally {
    await pool.query("RESET lock_timeout;");
    await pool.query("RESET statement_timeout;");
  }

  console.log("Manual route imported successfully:");
  console.log(`  route_id: ${routeId}`);
  console.log(`  route_name: ${spec.routeName}`);
  console.log(`  signboard: ${spec.signboard}`);
  console.log(`  checkpoints: ${spec.checkpoints.length}`);
  console.log(`  shape_points: ${spec.shapeCoordinates.length}`);
}

run()
  .catch((error) => {
    console.error("Manual route import failed:", error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
