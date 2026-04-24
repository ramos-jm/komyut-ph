import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

const ssl = String(process.env.DATABASE_SSL || "").toLowerCase() === "true"
  ? { rejectUnauthorized: false }
  : undefined;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl
});

async function run() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      "SELECT id, name, latitude, longitude FROM stops WHERE name ILIKE '%pitx%' ORDER BY id ASC;"
    );

    if (rows.length === 0) {
      console.log("PITX cleanup: no PITX rows found.");
      await client.query("COMMIT");
      return;
    }

    const primaryId = Number(rows[0].id);
    await client.query("UPDATE stops SET name=$2 WHERE id=$1;", [primaryId, "PITX"]);

    for (const row of rows.slice(1)) {
      const duplicateId = Number(row.id);

      await client.query(
        `DELETE FROM route_stops rs
         USING route_stops keep
         WHERE rs.stop_id=$1
           AND keep.stop_id=$2
           AND rs.route_id=keep.route_id;`,
        [duplicateId, primaryId]
      );

      await client.query("UPDATE route_stops SET stop_id=$2 WHERE stop_id=$1;", [duplicateId, primaryId]);
      await client.query("DELETE FROM stops WHERE id=$1;", [duplicateId]);
    }

    await client.query("COMMIT");
    console.log(`PITX cleanup: merged ${rows.length} rows into stop_id=${primaryId}.`);

    await client.query("REFRESH MATERIALIZED VIEW CONCURRENTLY route_graph_edges;");
    console.log("Refreshed route_graph_edges.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("PITX cleanup failed:", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
