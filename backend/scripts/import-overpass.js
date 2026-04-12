import fetch from "node-fetch";
import { pool, withTransaction } from "../src/db/pool.js";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const DEFAULT_BBOX = "14.35,120.85,14.83,121.20";

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
    bbox: entries.get("bbox") || DEFAULT_BBOX,
    limit: Number(entries.get("limit") || 300)
  };
}

function stopTypeFromTags(tags = {}) {
  if (tags.station || tags.railway === "station" || tags.subway) {
    return "train";
  }
  if (tags.route === "bus" && /uv|fx/i.test(tags.name || "")) {
    return "uv";
  }
  if (/jeep|jeepney/i.test(tags.name || "") || /jeep|jeepney/i.test(tags.network || "")) {
    return "jeep";
  }
  return "bus";
}

function routeTypeFromTags(tags = {}) {
  const route = (tags.route || "").toLowerCase();
  if (["subway", "light_rail", "train", "railway", "tram"].includes(route)) {
    return "train";
  }
  if (/jeep|jeepney/i.test(tags.name || "") || /jeep|jeepney/i.test(tags.network || "")) {
    return "jeep";
  }
  if (/uv|fx/i.test(tags.name || "")) {
    return "uv";
  }
  return "bus";
}

function normalizeSignboard(tags = {}) {
  if (tags.from && tags.to) {
    return `${tags.from}-${tags.to}`;
  }
  return tags.ref || tags.name || "No signboard";
}

function buildOverpassQuery({ bbox, limit }) {
  return `
[out:json][timeout:120];
(
  node["highway"="bus_stop"](${bbox});
  node["public_transport"="platform"](${bbox});
  node["railway"="station"](${bbox});
);
out body ${limit};

(
  relation["type"="route"]["route"~"bus|subway|light_rail|train|tram"](${bbox});
);
out body ${Math.max(80, Math.floor(limit / 2))};
>; 
out skel qt;
`;
}

async function fetchOverpass(query) {
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    body: query,
    headers: {
      "Content-Type": "text/plain",
      "User-Agent": "PH-Commute-Guide-Importer/1.0"
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Overpass request failed: ${response.status} ${text}`);
  }

  return response.json();
}

async function upsertStop(client, node) {
  const tags = node.tags || {};
  const name = tags.name || tags.ref || `Stop ${node.id}`;
  const type = stopTypeFromTags(tags);

  const existing = await client.query(
    `
      SELECT id
      FROM stops
      WHERE name = $1
        AND ABS(latitude - $2) < 0.00005
        AND ABS(longitude - $3) < 0.00005
      ORDER BY id DESC
      LIMIT 1;
    `,
    [name, node.lat, node.lon]
  );

  if (existing.rows[0]?.id) {
    return existing.rows[0].id;
  }

  const result = await client.query(
    `
      INSERT INTO stops (name, latitude, longitude, type)
      VALUES ($1, $2, $3, $4)
      RETURNING id;
    `,
    [name, node.lat, node.lon, type]
  );

  return result.rows[0]?.id || null;
}

async function upsertRoute(client, relation) {
  const tags = relation.tags || {};
  const name = tags.name || tags.ref || `Route ${relation.id}`;
  const type = routeTypeFromTags(tags);
  const signboard = normalizeSignboard(tags);

  const existing = await client.query(
    `
      SELECT id
      FROM routes
      WHERE name = $1 AND signboard = $2
      ORDER BY id DESC
      LIMIT 1;
    `,
    [name, signboard]
  );

  if (existing.rows[0]?.id) {
    return existing.rows[0].id;
  }

  const inserted = await client.query(
    `
      INSERT INTO routes (name, type, signboard)
      VALUES ($1, $2, $3)
      RETURNING id;
    `,
    [name, type, signboard]
  );

  return inserted.rows[0]?.id || null;
}

async function run() {
  const args = parseArgs();
  const query = buildOverpassQuery(args);
  console.log(`Fetching Overpass data for bbox ${args.bbox} ...`);

  const data = await fetchOverpass(query);
  const elements = data.elements || [];

  const nodes = elements.filter((el) => el.type === "node" && typeof el.lat === "number" && typeof el.lon === "number");
  const relations = elements.filter((el) => el.type === "relation" && el.tags?.type === "route");

  console.log(`Received ${nodes.length} nodes and ${relations.length} route relations.`);

  const nodeIdToStopId = new Map();
  let insertedStops = 0;
  let insertedRoutes = 0;
  let insertedRouteStops = 0;

  await withTransaction(async (client) => {
    for (const node of nodes) {
      const stopId = await upsertStop(client, node);
      if (stopId) {
        nodeIdToStopId.set(node.id, stopId);
        insertedStops += 1;
      }
    }

    for (const relation of relations) {
      const routeId = await upsertRoute(client, relation);
      if (!routeId) {
        continue;
      }
      insertedRoutes += 1;

      let order = 1;
      for (const member of relation.members || []) {
        if (member.type !== "node") {
          continue;
        }

        const stopId = nodeIdToStopId.get(member.ref);
        if (!stopId) {
          continue;
        }

        await client.query(
          `
            INSERT INTO route_stops (route_id, stop_id, stop_order)
            VALUES ($1, $2, $3)
            ON CONFLICT (route_id, stop_id) DO NOTHING;
          `,
          [routeId, stopId, order]
        );
        order += 1;
        insertedRouteStops += 1;
      }
    }
  });

  console.log("Import complete.");
  console.log(`Stops upserted: ${insertedStops}`);
  console.log(`Routes upserted: ${insertedRoutes}`);
  console.log(`Route-stop links upserted: ${insertedRouteStops}`);
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
