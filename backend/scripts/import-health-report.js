import { pool } from "../src/db/pool.js";

async function run() {
  const runResult = await pool.query(`
    SELECT id, status, started_at, completed_at, metrics
    FROM ingest_runs
    WHERE source = 'overpass-grid'
    ORDER BY started_at DESC
    LIMIT 1;
  `);

  if (!runResult.rows.length) {
    console.log("No overpass ingest run found.");
    return;
  }

  const run = runResult.rows[0];
  const metrics = run.metrics || {};

  console.log("Latest overpass ingest run:");
  console.log(`  run_id: ${run.id}`);
  console.log(`  status: ${run.status}`);
  console.log(`  started_at: ${run.started_at}`);
  console.log(`  completed_at: ${run.completed_at || "(running)"}`);
  console.log("\nReliability metrics:");
  console.log(`  failed_relations: ${metrics.relationFailures || 0}`);
  console.log(`  relation_retries: ${metrics.relationRetries || 0}`);
  console.log(`  stop_batch_retries: ${metrics.stopBatchRetries || 0}`);

  const before = metrics.graphStatsBefore || {};
  const after = metrics.graphStatsAfter || {};
  const growth = Number(metrics.graphEdgeGrowth || 0);

  console.log("\nGraph edge growth:");
  console.log(`  before: ${before.routeGraphEdges || 0}`);
  console.log(`  after: ${after.routeGraphEdges || 0}`);
  console.log(`  growth: ${growth >= 0 ? `+${growth}` : `${growth}`}`);

  if (before.routeGraphEdges != null && after.routeGraphEdges != null && before.routeGraphEdges > 0) {
    const pct = ((after.routeGraphEdges - before.routeGraphEdges) / before.routeGraphEdges) * 100;
    console.log(`  growth_pct: ${pct.toFixed(2)}%`);
  }
}

run()
  .catch((error) => {
    console.error("Import health report failed:", error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
