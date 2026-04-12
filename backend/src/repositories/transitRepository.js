import { pool } from "../db/pool.js";

export async function findNearbyStops({ lat, lng, radiusMeters = 1000, limit = 30 }) {
  const query = `
    SELECT
      id,
      name,
      latitude,
      longitude,
      type,
      ST_Distance(
        geom,
        ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
      ) AS distance_m
    FROM stops
    WHERE ST_DWithin(
      geom,
      ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
      $3
    )
    ORDER BY distance_m ASC
    LIMIT $4;
  `;

  const { rows } = await pool.query(query, [lat, lng, radiusMeters, limit]);
  return rows.map((row) => ({ ...row, distance_m: Number(row.distance_m) }));
}

export async function getRouteById(routeId) {
  const routeResult = await pool.query(
    `SELECT id, name, type, signboard FROM routes WHERE id = $1 LIMIT 1;`,
    [routeId]
  );

  if (routeResult.rows.length === 0) {
    return null;
  }

  const stopsResult = await pool.query(
    `
      SELECT
        s.id,
        s.name,
        s.latitude,
        s.longitude,
        s.type,
        rs.stop_order
      FROM route_stops rs
      JOIN stops s ON s.id = rs.stop_id
      WHERE rs.route_id = $1
      ORDER BY rs.stop_order ASC;
    `,
    [routeId]
  );

  return {
    ...routeResult.rows[0],
    stops: stopsResult.rows
  };
}

export async function getTransitGraph() {
  const edgeQuery = `
    SELECT
      rs1.stop_id AS from_stop_id,
      rs2.stop_id AS to_stop_id,
      r.id AS route_id,
      r.name AS route_name,
      r.type AS route_type,
      r.signboard
    FROM route_stops rs1
    JOIN route_stops rs2
      ON rs1.route_id = rs2.route_id
      AND rs2.stop_order = rs1.stop_order + 1
    JOIN routes r ON r.id = rs1.route_id;
  `;

  const stopQuery = `
    SELECT id, name, latitude, longitude, type
    FROM stops;
  `;

  const [{ rows: edges }, { rows: stops }] = await Promise.all([
    pool.query(edgeQuery),
    pool.query(stopQuery)
  ]);

  const adjacency = new Map();

  for (const edge of edges) {
    const forward = {
      fromStopId: edge.from_stop_id,
      toStopId: edge.to_stop_id,
      routeId: edge.route_id,
      routeName: edge.route_name,
      routeType: edge.route_type,
      signboard: edge.signboard
    };

    const backward = {
      fromStopId: edge.to_stop_id,
      toStopId: edge.from_stop_id,
      routeId: edge.route_id,
      routeName: edge.route_name,
      routeType: edge.route_type,
      signboard: edge.signboard
    };

    if (!adjacency.has(forward.fromStopId)) {
      adjacency.set(forward.fromStopId, []);
    }
    if (!adjacency.has(backward.fromStopId)) {
      adjacency.set(backward.fromStopId, []);
    }

    adjacency.get(forward.fromStopId).push(forward);
    adjacency.get(backward.fromStopId).push(backward);
  }

  const stopsById = new Map(stops.map((stop) => [stop.id, stop]));

  return { adjacency, stopsById };
}
