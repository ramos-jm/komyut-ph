import { pool } from "../src/db/pool.js";

async function scalar(sql) {
  const { rows } = await pool.query(sql);
  return Number(rows[0]?.count || 0);
}

async function run() {
  const stats = {
    stops: await scalar("SELECT COUNT(*)::INT AS count FROM stops;"),
    routes: await scalar("SELECT COUNT(*)::INT AS count FROM routes;"),
    route_stops: await scalar("SELECT COUNT(*)::INT AS count FROM route_stops;"),
    route_shape_points: await scalar("SELECT COUNT(*)::INT AS count FROM route_shape_points;"),
    route_graph_edges: await scalar("SELECT COUNT(*)::INT AS count FROM route_graph_edges;")
  };

  const badRoutes = await pool.query(`
    SELECT r.id, r.name, r.signboard
    FROM routes r
    LEFT JOIN route_stops rs ON rs.route_id = r.id
    GROUP BY r.id, r.name, r.signboard
    HAVING COUNT(rs.id) = 0
    ORDER BY r.id ASC
    LIMIT 20;
  `);

  const noShapeRoutes = await pool.query(`
    SELECT r.id, r.name, r.signboard
    FROM routes r
    LEFT JOIN route_shape_points sp ON sp.route_id = r.id
    GROUP BY r.id, r.name, r.signboard
    HAVING COUNT(sp.id) = 0
    ORDER BY r.id ASC
    LIMIT 20;
  `);

  console.log("Data health stats:");
  console.log(JSON.stringify(stats, null, 2));
  console.log("\nRoutes with zero route_stops (sample):", badRoutes.rows.length);
  console.log(badRoutes.rows);
  console.log("\nRoutes with zero shape points (sample):", noShapeRoutes.rows.length);
  console.log(noShapeRoutes.rows);
}

run()
  .catch((error) => {
    console.error("Health check failed:", error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
