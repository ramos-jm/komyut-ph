import { pool, withTransaction } from "../src/db/pool.js";

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

  return {
    runId: Number(entries.get("run-id") || 0)
  };
}

async function rollbackChange(client, change) {
  const key = change.record_key || {};
  const before = change.before_data;
  const after = change.after_data;

  if (change.table_name === "stops") {
    if (change.operation === "insert") {
      await client.query(`DELETE FROM stops WHERE id = $1;`, [key.id]);
      return;
    }

    if (change.operation === "update" && before) {
      await client.query(
        `
          UPDATE stops
          SET name = $2, latitude = $3, longitude = $4, type = $5
          WHERE id = $1;
        `,
        [key.id, before.name, before.latitude, before.longitude, before.type]
      );
    }

    return;
  }

  if (change.table_name === "routes") {
    if (change.operation === "insert") {
      await client.query(`DELETE FROM routes WHERE id = $1;`, [key.id]);
      return;
    }

    if (change.operation === "update" && before) {
      await client.query(
        `
          UPDATE routes
          SET name = $2, type = $3, signboard = $4
          WHERE id = $1;
        `,
        [key.id, before.name, before.type, before.signboard]
      );
    }

    return;
  }

  if (change.table_name === "route_stops" && change.operation === "insert") {
    await client.query(`DELETE FROM route_stops WHERE route_id = $1 AND stop_id = $2;`, [key.route_id, key.stop_id]);
    return;
  }

  if (change.table_name === "route_shape_points" && change.operation === "replace_shape") {
    await client.query(`DELETE FROM route_shape_points WHERE route_id = $1;`, [key.route_id]);

    const points = (before && Array.isArray(before.points)) ? before.points : [];
    for (const point of points) {
      await client.query(
        `
          INSERT INTO route_shape_points (route_id, seq, latitude, longitude)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (route_id, seq) DO UPDATE
          SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude;
        `,
        [key.route_id, Number(point.seq), Number(point.latitude), Number(point.longitude)]
      );
    }
    return;
  }

  if (change.table_name === "route_shape_points" && change.operation === "delete" && after) {
    const points = Array.isArray(after.points) ? after.points : [];
    for (const point of points) {
      await client.query(
        `
          INSERT INTO route_shape_points (route_id, seq, latitude, longitude)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (route_id, seq) DO UPDATE
          SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude;
        `,
        [key.route_id, Number(point.seq), Number(point.latitude), Number(point.longitude)]
      );
    }
  }
}

async function run() {
  const args = parseArgs();

  if (!Number.isInteger(args.runId) || args.runId <= 0) {
    throw new Error("Provide a valid run id using --run-id <id>");
  }

  await withTransaction(async (client) => {
    const runResult = await client.query(
      `
        SELECT id, status, source, region_key, started_at
        FROM ingest_runs
        WHERE id = $1
        LIMIT 1;
      `,
      [args.runId]
    );

    if (runResult.rows.length === 0) {
      throw new Error(`Ingest run ${args.runId} not found`);
    }

    const run = runResult.rows[0];
    if (run.status === "rolled_back") {
      throw new Error(`Ingest run ${args.runId} is already rolled back`);
    }

    const changes = await client.query(
      `
        SELECT id, table_name, operation, record_key, before_data, after_data
        FROM ingest_run_changes
        WHERE ingest_run_id = $1
        ORDER BY id DESC;
      `,
      [args.runId]
    );

    for (const change of changes.rows) {
      await rollbackChange(client, change);
    }

    await client.query(
      `
        UPDATE ingest_runs
        SET status = 'rolled_back', completed_at = NOW(), error_text = NULL
        WHERE id = $1;
      `,
      [args.runId]
    );

    console.log(`Rolled back ingest run ${args.runId} (${run.region_key}, ${run.source}).`);
    console.log(`Reverted ${changes.rows.length} change records.`);
  });
}

run()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
