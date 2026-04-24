import { pool } from "../src/db/pool.js";

const LOCK_KEY = 7312026;

async function run() {
  const lockRows = await pool.query(
    `
      SELECT
        a.pid,
        a.usename,
        a.state,
        a.query,
        a.query_start,
        a.state_change,
        now() - a.query_start AS query_age
      FROM pg_locks l
      JOIN pg_stat_activity a ON a.pid = l.pid
      WHERE l.locktype = 'advisory'
        AND l.objid = $1
        AND l.granted = true;
    `,
    [LOCK_KEY]
  );

  if (!lockRows.rows.length) {
    console.log("No active import advisory lock holder found.");
    return;
  }

  console.log("Active import lock holders:");
  console.table(
    lockRows.rows.map((row) => ({
      pid: row.pid,
      usename: row.usename,
      state: row.state,
      query_age: row.query_age,
      query: String(row.query || "").slice(0, 120)
    }))
  );

  for (const row of lockRows.rows) {
    const terminated = await pool.query("SELECT pg_terminate_backend($1) AS ok;", [row.pid]);
    console.log(`Terminated PID ${row.pid}:`, Boolean(terminated.rows[0]?.ok));
  }
}

run()
  .catch((error) => {
    console.error("Failed to resolve import lock:", error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
