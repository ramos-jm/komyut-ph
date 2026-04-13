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

export async function searchStopsByName(query, limit = 20) {
  const searchQuery = `
    SELECT
      s.id,
      s.name,
      s.latitude,
      s.longitude,
      s.type,
      COUNT(DISTINCT r.id) as route_count
    FROM stops s
    LEFT JOIN route_stops rs ON s.id = rs.stop_id
    LEFT JOIN routes r ON rs.route_id = r.id
    WHERE s.name ILIKE $1
    GROUP BY s.id, s.name, s.latitude, s.longitude, s.type
    ORDER BY route_count DESC, s.name ASC
    LIMIT $2;
  `;

  const { rows } = await pool.query(searchQuery, [`%${query}%`, limit]);
  return rows.map((row) => ({
    ...row,
    route_count: Number(row.route_count)
  }));
}

export async function getAllStopNames() {
  const query = `
    SELECT DISTINCT name
    FROM stops
    ORDER BY name ASC;
  `;

  const { rows } = await pool.query(query);
  return rows.map((row) => row.name);
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

  return buildGraph(edges, stops);
}

function buildGraph(edges, stops) {
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

export async function getTransitGraphWithinBounds({ minLat, maxLat, minLng, maxLng }) {
  const boundedStopsQuery = `
    SELECT id, name, latitude, longitude, type
    FROM stops
    WHERE latitude BETWEEN $1 AND $2
      AND longitude BETWEEN $3 AND $4;
  `;

  const boundedEdgesQuery = `
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
    JOIN routes r ON r.id = rs1.route_id
    JOIN stops s_from ON s_from.id = rs1.stop_id
    JOIN stops s_to ON s_to.id = rs2.stop_id
    WHERE s_from.latitude BETWEEN $1 AND $2
      AND s_from.longitude BETWEEN $3 AND $4
      AND s_to.latitude BETWEEN $1 AND $2
      AND s_to.longitude BETWEEN $3 AND $4;
  `;

  const [{ rows: stops }, { rows: edges }] = await Promise.all([
    pool.query(boundedStopsQuery, [minLat, maxLat, minLng, maxLng]),
    pool.query(boundedEdgesQuery, [minLat, maxLat, minLng, maxLng])
  ]);

  return buildGraph(edges, stops);
}

export async function getRouteShapePointsMap() {
  let rows = [];

  try {
    const result = await pool.query(
      `
        SELECT route_id, seq, latitude, longitude
        FROM route_shape_points
        ORDER BY route_id, seq ASC;
      `
    );
    rows = result.rows;
  } catch (error) {
    // Allow route search to continue with stop-to-stop geometry until migration is applied.
    if (error?.code === "42P01") {
      return new Map();
    }
    throw error;
  }

  const shapeMap = new Map();
  for (const row of rows) {
    const routeId = Number(row.route_id);
    if (!shapeMap.has(routeId)) {
      shapeMap.set(routeId, []);
    }
    shapeMap.get(routeId).push([Number(row.longitude), Number(row.latitude)]);
  }

  return shapeMap;
}

export async function getRouteShapePoints(routeId) {
  try {
    const result = await pool.query(
      `
        SELECT route_id, seq, latitude, longitude
        FROM route_shape_points
        WHERE route_id = $1
        ORDER BY seq ASC;
      `,
      [routeId]
    );
    return result.rows.map((row) => ({
      seq: Number(row.seq),
      latitude: Number(row.latitude),
      longitude: Number(row.longitude)
    }));
  } catch (error) {
    if (error?.code === "42P01") {
      return [];
    }
    throw error;
  }
}
