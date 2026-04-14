import fetch from "node-fetch";
import { pool, withTransaction } from "../src/db/pool.js";
import { env } from "../src/config/env.js";
import { resolveRegionConfig } from "../src/config/regions.js";

const OVERPASS_URLS = (
  process.env.OVERPASS_URLS
    ? process.env.OVERPASS_URLS.split(",").map((url) => url.trim()).filter(Boolean)
    : [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter"
      ]
);

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
    region: entries.get("region") || env.importDefaultRegion,
    bbox: entries.get("bbox") || null,
    limit: Number(entries.get("limit") || env.importDefaultLimit)
  };
}

async function startIngestRun(client, params) {
  const result = await client.query(
    `
      INSERT INTO ingest_runs (source, region_key, bbox, import_limit, status)
      VALUES ($1, $2, $3, $4, 'running')
      RETURNING id;
    `,
    ["overpass", params.regionKey, params.bbox, params.limit]
  );

  return Number(result.rows[0].id);
}

async function finalizeIngestRun(client, ingestRunId, status, metrics, errorText = null) {
  await client.query(
    `
      UPDATE ingest_runs
      SET
        status = $2,
        completed_at = NOW(),
        metrics = $3::jsonb,
        error_text = $4
      WHERE id = $1;
    `,
    [ingestRunId, status, JSON.stringify(metrics || {}), errorText]
  );
}

async function recordChange(client, ingestRunId, tableName, operation, recordKey, beforeData, afterData) {
  await client.query(
    `
      INSERT INTO ingest_run_changes (ingest_run_id, table_name, operation, record_key, before_data, after_data)
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb);
    `,
    [
      ingestRunId,
      tableName,
      operation,
      JSON.stringify(recordKey || {}),
      beforeData ? JSON.stringify(beforeData) : null,
      afterData ? JSON.stringify(afterData) : null
    ]
  );
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
out body;
`;
}

async function fetchOverpass(query) {
  const maxAttemptsPerEndpoint = 3;
  let lastError = null;

  for (const overpassUrl of OVERPASS_URLS) {
    for (let attempt = 1; attempt <= maxAttemptsPerEndpoint; attempt += 1) {
      try {
        const response = await fetch(overpassUrl, {
          method: "POST",
          body: query,
          headers: {
            "Content-Type": "text/plain",
            "User-Agent": "PH-Commute-Guide-Importer/1.0"
          }
        });

        if (!response.ok) {
          const text = await response.text();
          const isRetriable =
            response.status >= 500 ||
            response.status === 429 ||
            /too busy|timeout|dispatcher_client::request_read_and_idx::timeout/i.test(text);

          const error = new Error(`Overpass request failed: ${response.status} ${text}`);
          if (!isRetriable) {
            throw error;
          }

          lastError = error;
          const delayMs = attempt * 2000;
          console.warn(
            `Overpass busy at ${overpassUrl} (attempt ${attempt}/${maxAttemptsPerEndpoint}). Retrying in ${delayMs}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        return response.json();
      } catch (error) {
        lastError = error;
        const delayMs = attempt * 2000;

        if (attempt < maxAttemptsPerEndpoint) {
          console.warn(
            `Overpass request error at ${overpassUrl} (attempt ${attempt}/${maxAttemptsPerEndpoint}): ${error.message}`
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
      }
    }
  }

  throw lastError || new Error("Overpass request failed after retries.");
}

async function upsertStop(client, node, ingestRunId, metrics) {
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
    const stopId = Number(existing.rows[0].id);
    const current = await client.query(
      `SELECT id, name, latitude, longitude, type FROM stops WHERE id = $1 LIMIT 1;`,
      [stopId]
    );

    const next = {
      name,
      latitude: node.lat,
      longitude: node.lon,
      type
    };

    const previous = current.rows[0];
    const hasChanges =
      !previous ||
      previous.name !== next.name ||
      Number(previous.latitude) !== Number(next.latitude) ||
      Number(previous.longitude) !== Number(next.longitude) ||
      previous.type !== next.type;

    if (hasChanges) {
      await client.query(
        `
          UPDATE stops
          SET name = $2, latitude = $3, longitude = $4, type = $5
          WHERE id = $1;
        `,
        [stopId, next.name, next.latitude, next.longitude, next.type]
      );

      await recordChange(client, ingestRunId, "stops", "update", { id: stopId }, previous || null, {
        id: stopId,
        ...next
      });
      metrics.stopsUpdated += 1;
    } else {
      metrics.stopsUnchanged += 1;
    }

    return stopId;
  }

  const result = await client.query(
    `
      INSERT INTO stops (name, latitude, longitude, type)
      VALUES ($1, $2, $3, $4)
      RETURNING id;
    `,
    [name, node.lat, node.lon, type]
  );

  const inserted = result.rows[0]?.id ? Number(result.rows[0].id) : null;
  if (inserted) {
    await recordChange(client, ingestRunId, "stops", "insert", { id: inserted }, null, {
      id: inserted,
      name,
      latitude: node.lat,
      longitude: node.lon,
      type
    });
    metrics.stopsInserted += 1;
  }

  return inserted;
}

async function upsertRoute(client, relation, ingestRunId, metrics) {
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
    const routeId = Number(existing.rows[0].id);
    const current = await client.query(
      `SELECT id, name, type, signboard FROM routes WHERE id = $1 LIMIT 1;`,
      [routeId]
    );

    const previous = current.rows[0];
    const next = { name, type, signboard };
    const hasChanges = !previous || previous.name !== name || previous.type !== type || previous.signboard !== signboard;

    if (hasChanges) {
      await client.query(
        `
          UPDATE routes
          SET name = $2, type = $3, signboard = $4
          WHERE id = $1;
        `,
        [routeId, name, type, signboard]
      );

      await recordChange(client, ingestRunId, "routes", "update", { id: routeId }, previous || null, {
        id: routeId,
        ...next
      });
      metrics.routesUpdated += 1;
    } else {
      metrics.routesUnchanged += 1;
    }

    return routeId;
  }

  const inserted = await client.query(
    `
      INSERT INTO routes (name, type, signboard)
      VALUES ($1, $2, $3)
      RETURNING id;
    `,
    [name, type, signboard]
  );

  const routeId = inserted.rows[0]?.id ? Number(inserted.rows[0].id) : null;
  if (routeId) {
    await recordChange(client, ingestRunId, "routes", "insert", { id: routeId }, null, {
      id: routeId,
      name,
      type,
      signboard
    });
    metrics.routesInserted += 1;
  }

  return routeId;
}

function buildNodeMap(elements) {
  const nodeMap = new Map();
  const nodes = elements.filter((el) => el.type === "node" && typeof el.lat === "number" && typeof el.lon === "number");
  for (const node of nodes) {
    nodeMap.set(node.id, [node.lon, node.lat]);
  }
  return nodeMap;
}

function buildWayMap(elements) {
  const wayMap = new Map();
  const ways = elements.filter((el) => el.type === "way" && el.nodes);
  for (const way of ways) {
    wayMap.set(way.id, way.nodes || []);
  }
  return wayMap;
}

function extractRouteShape(relation, nodeMap, wayMap) {
  const shapeCoords = [];
  const wayMembers = (relation.members || []).filter((m) => m.type === "way");

  if (wayMembers.length === 0) {
    return shapeCoords;
  }

  for (const wayMember of wayMembers) {
    const wayNodes = wayMap.get(wayMember.ref);
    if (!wayNodes || wayNodes.length === 0) {
      continue;
    }

    const wayCoords = [];
    for (const nodeId of wayNodes) {
      const coord = nodeMap.get(nodeId);
      if (coord) {
        wayCoords.push(coord);
      }
    }

    if (wayCoords.length === 0) {
      continue;
    }

    // Direction correction: if previous last coord is closer to way end than way start, reverse
    if (shapeCoords.length > 0 && wayCoords.length >= 2) {
      const prevLast = shapeCoords[shapeCoords.length - 1];
      const wayStart = wayCoords[0];
      const wayEnd = wayCoords[wayCoords.length - 1];

      const distToStart = (prevLast[0] - wayStart[0]) ** 2 + (prevLast[1] - wayStart[1]) ** 2;
      const distToEnd = (prevLast[0] - wayEnd[0]) ** 2 + (prevLast[1] - wayEnd[1]) ** 2;

      if (distToEnd < distToStart) {
        wayCoords.reverse();
      }
    }

    // Deduplicate: skip if same as previous last coord
    for (const coord of wayCoords) {
      const prev = shapeCoords[shapeCoords.length - 1];
      if (!prev || prev[0] !== coord[0] || prev[1] !== coord[1]) {
        shapeCoords.push(coord);
      }
    }
  }

  return shapeCoords;
}

async function upsertRouteShape(client, routeId, shapeCoords, ingestRunId, metrics) {
  if (shapeCoords.length === 0) {
    return 0;
  }

  const beforeRows = await client.query(
    `
      SELECT seq, latitude, longitude
      FROM route_shape_points
      WHERE route_id = $1
      ORDER BY seq ASC;
    `,
    [routeId]
  );

  // Clear existing points for this route
  await client.query(`DELETE FROM route_shape_points WHERE route_id = $1;`, [routeId]);

  let inserted = 0;
  for (let seq = 1; seq <= shapeCoords.length; seq += 1) {
    const [lon, lat] = shapeCoords[seq - 1];
    await client.query(
      `
        INSERT INTO route_shape_points (route_id, seq, latitude, longitude)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (route_id, seq) DO UPDATE
        SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude;
      `,
      [routeId, seq, lat, lon]
    );
    inserted += 1;
  }

  const afterRows = await client.query(
    `
      SELECT seq, latitude, longitude
      FROM route_shape_points
      WHERE route_id = $1
      ORDER BY seq ASC;
    `,
    [routeId]
  );

  await recordChange(
    client,
    ingestRunId,
    "route_shape_points",
    "replace_shape",
    { route_id: routeId },
    { points: beforeRows.rows },
    { points: afterRows.rows }
  );

  metrics.shapeRoutesReplaced += 1;
  metrics.shapePointsUpserted += inserted;
  return inserted;
}

async function run() {
  const args = parseArgs();
  const region = resolveRegionConfig(args.region, args.bbox);
  const importParams = {
    regionKey: region.regionKey,
    bbox: region.bbox,
    limit: Number.isFinite(args.limit) ? args.limit : env.importDefaultLimit
  };

  const query = buildOverpassQuery({ bbox: importParams.bbox, limit: importParams.limit });
  console.log(`Fetching Overpass data for region ${importParams.regionKey} with bbox ${importParams.bbox} ...`);

  const data = await fetchOverpass(query);
  const elements = data.elements || [];

  const nodes = elements.filter((el) => el.type === "node" && typeof el.lat === "number" && typeof el.lon === "number");
  const relations = elements.filter((el) => el.type === "relation" && el.tags?.type === "route");

  console.log(`Received ${nodes.length} nodes and ${relations.length} route relations.`);

  const nodeIdToStopId = new Map();
  const nodeMap = buildNodeMap(elements);
  const wayMap = buildWayMap(elements);
  const metrics = {
    nodesReceived: nodes.length,
    relationsReceived: relations.length,
    stopsInserted: 0,
    stopsUpdated: 0,
    stopsUnchanged: 0,
    routesInserted: 0,
    routesUpdated: 0,
    routesUnchanged: 0,
    routeStopsInserted: 0,
    shapePointsUpserted: 0,
    shapeRoutesReplaced: 0
  };

  let ingestRunId = null;

  await withTransaction(async (client) => {
    ingestRunId = await startIngestRun(client, importParams);

    for (const node of nodes) {
      const stopId = await upsertStop(client, node, ingestRunId, metrics);
      if (stopId) {
        nodeIdToStopId.set(node.id, stopId);
      }
    }

    for (const relation of relations) {
      const routeId = await upsertRoute(client, relation, ingestRunId, metrics);
      if (!routeId) {
        continue;
      }

      let order = 1;
      for (const member of relation.members || []) {
        if (member.type !== "node") {
          continue;
        }

        const stopId = nodeIdToStopId.get(member.ref);
        if (!stopId) {
          continue;
        }

        const insertResult = await client.query(
          `
            INSERT INTO route_stops (route_id, stop_id, stop_order)
            VALUES ($1, $2, $3)
            ON CONFLICT (route_id, stop_id) DO NOTHING;
          `,
          [routeId, stopId, order]
        );

        if (insertResult.rowCount > 0) {
          await recordChange(client, ingestRunId, "route_stops", "insert", {
            route_id: routeId,
            stop_id: stopId
          }, null, {
            route_id: routeId,
            stop_id: stopId,
            stop_order: order
          });
          metrics.routeStopsInserted += 1;
        }

        order += 1;
      }

      // Extract and upsert route shape geometry
      const shapeCoords = extractRouteShape(relation, nodeMap, wayMap);
      if (shapeCoords.length > 0) {
        await upsertRouteShape(client, routeId, shapeCoords, ingestRunId, metrics);
      }
    }

    await finalizeIngestRun(client, ingestRunId, "success", metrics);
  });

  console.log("Import complete.");
  console.log(`Ingest run id: ${ingestRunId}`);
  console.log(`Stops inserted: ${metrics.stopsInserted}, updated: ${metrics.stopsUpdated}, unchanged: ${metrics.stopsUnchanged}`);
  console.log(`Routes inserted: ${metrics.routesInserted}, updated: ${metrics.routesUpdated}, unchanged: ${metrics.routesUnchanged}`);
  console.log(`Route-stop links inserted: ${metrics.routeStopsInserted}`);
  console.log(`Route shape points upserted: ${metrics.shapePointsUpserted} (${metrics.shapeRoutesReplaced} routes with geometry)`);
}

run()
  .catch((error) => {
    console.error(error);
    withTransaction(async (client) => {
      const last = await client.query(
        `
          SELECT id
          FROM ingest_runs
          WHERE source = 'overpass' AND status = 'running'
          ORDER BY started_at DESC
          LIMIT 1;
        `
      );

      if (last.rows[0]?.id) {
        await finalizeIngestRun(client, Number(last.rows[0].id), "failed", {}, error.message || String(error));
      }
    }).catch(() => {});
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
