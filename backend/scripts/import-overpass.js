import fetch from "node-fetch";
import { pool, withTransaction } from "../src/db/pool.js";
import { env } from "../src/config/env.js";
import { resolveRegionConfig } from "../src/config/regions.js";

// ─── Overpass endpoints (rotate on failure) ────────────────────────────────
const OVERPASS_URLS = (
  process.env.OVERPASS_URLS
    ? process.env.OVERPASS_URLS.split(",").map((u) => u.trim()).filter(Boolean)
    : [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass.openstreetmap.ru/api/interpreter"
      ]
);

const IMPORT_LOCK_KEY = 7312026;

// ─── CLI args ──────────────────────────────────────────────────────────────
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
    limit: Number(entries.get("limit") || env.importDefaultLimit),
    // How many lat×lng grid cells to divide the bbox into
    gridLat: Number(entries.get("grid-lat") || 3),
    gridLng: Number(entries.get("grid-lng") || 4)
  };
}

// ─── Grid generator ────────────────────────────────────────────────────────
/**
 * Split a "minLat,minLng,maxLat,maxLng" bbox string into a grid of smaller
 * cells so each Overpass request covers a manageable area.
 */
function buildGrid(bboxStr, latCells, lngCells) {
  const [minLat, minLng, maxLat, maxLng] = bboxStr.split(",").map(Number);
  const latStep = (maxLat - minLat) / latCells;
  const lngStep = (maxLng - minLng) / lngCells;
  const cells = [];
  for (let r = 0; r < latCells; r++) {
    for (let c = 0; c < lngCells; c++) {
      const cMinLat = (minLat + r * latStep).toFixed(6);
      const cMaxLat = (minLat + (r + 1) * latStep).toFixed(6);
      const cMinLng = (minLng + c * lngStep).toFixed(6);
      const cMaxLng = (minLng + (c + 1) * lngStep).toFixed(6);
      // Overpass bbox format: south,west,north,east
      cells.push(`${cMinLat},${cMinLng},${cMaxLat},${cMaxLng}`);
    }
  }
  return cells;
}

// ─── Query builders ────────────────────────────────────────────────────────
/**
 * Fetches stop nodes only.
 * Uses `out body;` — no relation expansion needed.
 */
function buildStopQuery(bbox, limit) {
  return `
[out:json][timeout:180][maxsize:536870912];
(
  node["highway"="bus_stop"](${bbox});
  node["public_transport"="stop_position"](${bbox});
  node["public_transport"="platform"](${bbox});
  node["railway"="station"](${bbox});
  node["railway"="halt"](${bbox});
  node["amenity"="bus_station"](${bbox});
);
out body ${limit};
`.trim();
}

/**
 * Fetches route relations with full member geometry inline (out geom;).
 * This avoids the `>; out body;` explosion that caused timeouts — geometry
 * for way members is embedded directly in each relation's JSON.
 */
function buildRouteQuery(bbox, limit) {
  return `
[out:json][timeout:180][maxsize:536870912];
(
  relation["type"="route"]["route"="bus"](${bbox});
  relation["type"="route"]["route"="jeepney"](${bbox});
  relation["type"="route"]["route"="subway"](${bbox});
  relation["type"="route"]["route"="light_rail"](${bbox});
  relation["type"="route"]["route"="train"](${bbox});
  relation["type"="route"]["route"="tram"](${bbox});
  relation["type"="route"]["route"="share_taxi"](${bbox});
  relation["type"="route"]["route"="ferry"](${bbox});
);
out geom ${limit};
`.trim();
}

// ─── HTTP fetch with retry + endpoint rotation ─────────────────────────────
async function fetchOverpass(query) {
  const maxAttemptsPerEndpoint = 3;
  let lastError = null;
  for (const url of OVERPASS_URLS) {
    for (let attempt = 1; attempt <= maxAttemptsPerEndpoint; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          body: `data=${encodeURIComponent(query)}`,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "PH-Commute-Guide-Importer/2.0 (public-transit-research)"
          },
          timeout: 200000
        });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          const isRetriable =
            response.status >= 500 ||
            response.status === 429 ||
            /too busy|timeout|rate limit/i.test(text);
          if (!isRetriable) throw new Error(`Overpass ${response.status}: ${text.slice(0, 200)}`);
          lastError = new Error(`Overpass busy at ${url} (${response.status})`);
          const delay = attempt * 3000;
          console.warn(`  ↺  Retrying in ${delay / 1000}s… (attempt ${attempt}/${maxAttemptsPerEndpoint})`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        return response.json();
      } catch (err) {
        lastError = err;
        if (attempt < maxAttemptsPerEndpoint) {
          const delay = attempt * 3000;
          console.warn(`  ↺  ${url} error: ${err.message}. Retrying in ${delay / 1000}s…`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    console.warn(`  ✗  All attempts failed for ${url}, trying next endpoint…`);
  }
  throw lastError || new Error("All Overpass endpoints exhausted.");
}

// ─── Type detection helpers ─────────────────────────────────────────────────
function stopTypeFromTags(tags = {}) {
  const r = (tags.route || "").toLowerCase();
  if (tags.station || tags.railway === "station" || r === "subway" || r === "light_rail" || r === "train") return "train";
  if (/uv|fx/i.test(tags.name || "")) return "uv";
  if (/jeep|jeepney/i.test(tags.name || "") || /jeep|jeepney/i.test(tags.network || "")) return "jeep";
  return "bus";
}

function routeTypeFromTags(tags = {}) {
  const r = (tags.route || "").toLowerCase();
  if (["subway", "light_rail", "train", "railway", "tram"].includes(r)) return "train";
  if (r === "jeepney") return "jeep";
  if (/jeep|jeepney/i.test(tags.name || "") || /jeep|jeepney/i.test(tags.network || "")) return "jeep";
  if (/uv|fx/i.test(tags.name || "")) return "uv";
  return "bus";
}

function normalizeSignboard(tags = {}) {
  if (tags.from && tags.to) return `${tags.from}-${tags.to}`;
  if (tags.ref) return tags.ref;
  return tags.name || "No signboard";
}

function normalizeStopName(rawName = "") {
  const input = String(rawName || "").trim();
  if (!input) return input;

  // Collapse directional PITX variants into one canonical stop label.
  if (/\bpitx\b/i.test(input)) {
    return "PITX";
  }

  return input.replace(/\s+/g, " ").trim();
}

async function ensureImporterSchema(client) {
  await client.query("ALTER TABLE routes ADD COLUMN IF NOT EXISTS source_relation_id BIGINT;");
  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_routes_source_relation_id_unique
     ON routes (source_relation_id)
     WHERE source_relation_id IS NOT NULL;`
  );
}

// ─── Shape extraction (uses embedded geom from `out geom;`) ────────────────
function coordDistSq(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

function nearestShapeIndex(shapeCoords, targetCoord) {
  let minIndex = 0;
  let minDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < shapeCoords.length; i += 1) {
    const distance = coordDistSq(shapeCoords[i], targetCoord);
    if (distance < minDistance) {
      minDistance = distance;
      minIndex = i;
    }
  }

  return minIndex;
}

function relationStopMembers(relation) {
  return (relation.members || []).filter((member) => {
    if (member.type !== "node") return false;
    const role = (member.role || "").toLowerCase();
    return role === "" || role.includes("stop") || role.includes("platform");
  });
}

function orderStopMembersByShape(stopMembers, shapeCoords) {
  if (!Array.isArray(shapeCoords) || shapeCoords.length < 2 || stopMembers.length <= 1) {
    return stopMembers;
  }

  return [...stopMembers].sort((a, b) => {
    const idxA = nearestShapeIndex(shapeCoords, [a.lon, a.lat]);
    const idxB = nearestShapeIndex(shapeCoords, [b.lon, b.lat]);
    if (idxA !== idxB) {
      return idxA - idxB;
    }
    return a.ref - b.ref;
  });
}

/**
 * Build ordered shape coordinates from a relation fetched with `out geom;`.
 * Member ways already carry their `geometry` arrays — no separate node/way
 * map needed, which was the root cause of the previous timeout issues.
 */
function extractShapeFromGeom(relation) {
  const coords = [];
  const wayMembers = (relation.members || []).filter(
    (m) => m.type === "way" && Array.isArray(m.geometry) && m.geometry.length >= 2
  );
  if (wayMembers.length === 0) return coords;

  for (const way of wayMembers) {
    // geometry entries are { lat, lon }
    const wayCoords = way.geometry.map((pt) => [pt.lon, pt.lat]);

    // Direction correction: if the last accumulated point is closer to
    // this way's end than its start, reverse the way.
    if (coords.length > 0) {
      const prev = coords[coords.length - 1];
      const dStart = coordDistSq(prev, wayCoords[0]);
      const dEnd = coordDistSq(prev, wayCoords[wayCoords.length - 1]);
      if (dEnd < dStart) wayCoords.reverse();
    }

    // Append with deduplication
    for (const coord of wayCoords) {
      const last = coords[coords.length - 1];
      if (!last || last[0] !== coord[0] || last[1] !== coord[1]) {
        coords.push(coord);
      }
    }
  }
  return coords;
}

// ─── Ingest audit helpers ──────────────────────────────────────────────────
async function startIngestRun(client, params) {
  const result = await client.query(
    `INSERT INTO ingest_runs (source, region_key, bbox, import_limit, status)
     VALUES ($1, $2, $3, $4, 'running') RETURNING id;`,
    ["overpass-grid", params.regionKey, params.bbox, params.limit]
  );
  return Number(result.rows[0].id);
}

async function finalizeIngestRun(client, id, status, metrics, errorText = null) {
  await client.query(
    `UPDATE ingest_runs SET status=$2, completed_at=NOW(), metrics=$3::jsonb, error_text=$4 WHERE id=$1;`,
    [id, status, JSON.stringify(metrics || {}), errorText]
  );
}

async function getGraphStats(client) {
  const result = await client.query(`
    SELECT
      (SELECT COUNT(*)::INT FROM stops) AS stops_count,
      (SELECT COUNT(*)::INT FROM routes) AS routes_count,
      (SELECT COUNT(*)::INT FROM route_stops) AS route_stops_count,
      (SELECT COUNT(*)::INT FROM route_graph_edges) AS route_graph_edges_count;
  `);

  const row = result.rows[0] || {};
  return {
    stops: Number(row.stops_count || 0),
    routes: Number(row.routes_count || 0),
    routeStops: Number(row.route_stops_count || 0),
    routeGraphEdges: Number(row.route_graph_edges_count || 0)
  };
}

async function refreshRouteGraphEdges() {
  try {
    await pool.query("REFRESH MATERIALIZED VIEW CONCURRENTLY route_graph_edges;");
  } catch (error) {
    // Fallback when concurrent refresh is not possible.
    if (error?.code === "55000") {
      await pool.query("REFRESH MATERIALIZED VIEW route_graph_edges;");
      return;
    }
    throw error;
  }
}

async function recordChange(client, ingestRunId, tableName, operation, recordKey, before, after) {
  await client.query(
    `INSERT INTO ingest_run_changes
       (ingest_run_id, table_name, operation, record_key, before_data, after_data)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb);`,
    [
      ingestRunId, tableName, operation,
      JSON.stringify(recordKey || {}),
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null
    ]
  );
}

// ─── Upsert helpers ────────────────────────────────────────────────────────
async function upsertStop(client, node, ingestRunId, metrics) {
  const tags = node.tags || {};
  const rawName = tags.name || tags.ref || `Stop ${node.id}`;
  const name = normalizeStopName(rawName);
  const type = stopTypeFromTags(tags);

  let existing = await client.query(
    `SELECT id FROM stops
     WHERE name=$1 AND ABS(latitude-$2)<0.00005 AND ABS(longitude-$3)<0.00005
     ORDER BY id DESC LIMIT 1;`,
    [name, node.lat, node.lon]
  );

  if (!existing.rows[0]?.id && name === "PITX") {
    existing = await client.query(
      `SELECT id FROM stops
       WHERE name ILIKE '%pitx%'
         AND ABS(latitude-$1)<0.001
         AND ABS(longitude-$2)<0.001
       ORDER BY id ASC
       LIMIT 1;`,
      [node.lat, node.lon]
    );
  }

  if (existing.rows[0]?.id) {
    const stopId = Number(existing.rows[0].id);
    const cur = await client.query(
      "SELECT id,name,latitude,longitude,type FROM stops WHERE id=$1 LIMIT 1;",
      [stopId]
    );
    const prev = cur.rows[0];
    const next = { name, latitude: node.lat, longitude: node.lon, type };
    if (!prev || prev.name !== name || Number(prev.latitude) !== node.lat || Number(prev.longitude) !== node.lon || prev.type !== type) {
      await client.query(
        "UPDATE stops SET name=$2,latitude=$3,longitude=$4,type=$5 WHERE id=$1;",
        [stopId, name, node.lat, node.lon, type]
      );
      await recordChange(client, ingestRunId, "stops", "update", { id: stopId }, prev, { id: stopId, ...next });
      metrics.stopsUpdated += 1;
    } else {
      metrics.stopsUnchanged += 1;
    }
    return stopId;
  }

  const ins = await client.query(
    "INSERT INTO stops (name,latitude,longitude,type) VALUES ($1,$2,$3,$4) RETURNING id;",
    [name, node.lat, node.lon, type]
  );
  const id = ins.rows[0]?.id ? Number(ins.rows[0].id) : null;
  if (id) {
    await recordChange(client, ingestRunId, "stops", "insert", { id }, null, { id, name, latitude: node.lat, longitude: node.lon, type });
    metrics.stopsInserted += 1;
  }
  return id;
}

async function upsertRoute(client, relation, ingestRunId, metrics) {
  const tags = relation.tags || {};
  const name = tags.name || tags.ref || `Route ${relation.id}`;
  const type = routeTypeFromTags(tags);
  const signboard = normalizeSignboard(tags);
  const sourceRelationId = Number(relation.id);

  const existing = await client.query(
    "SELECT id FROM routes WHERE source_relation_id=$1 ORDER BY id DESC LIMIT 1;",
    [sourceRelationId]
  );

  if (existing.rows[0]?.id) {
    const routeId = Number(existing.rows[0].id);
    const cur = await client.query(
      "SELECT id,name,type,signboard,source_relation_id FROM routes WHERE id=$1 LIMIT 1;",
      [routeId]
    );
    const prev = cur.rows[0];
    if (!prev || prev.name !== name || prev.type !== type || prev.signboard !== signboard || Number(prev.source_relation_id) !== sourceRelationId) {
      await client.query(
        "UPDATE routes SET name=$2,type=$3,signboard=$4,source_relation_id=$5 WHERE id=$1;",
        [routeId, name, type, signboard, sourceRelationId]
      );
      await recordChange(
        client,
        ingestRunId,
        "routes",
        "update",
        { id: routeId },
        prev,
        { id: routeId, name, type, signboard, source_relation_id: sourceRelationId }
      );
      metrics.routesUpdated += 1;
    } else {
      metrics.routesUnchanged += 1;
    }
    return routeId;
  }

  const ins = await client.query(
    "INSERT INTO routes (name,type,signboard,source_relation_id) VALUES ($1,$2,$3,$4) RETURNING id;",
    [name, type, signboard, sourceRelationId]
  );
  const routeId = ins.rows[0]?.id ? Number(ins.rows[0].id) : null;
  if (routeId) {
    await recordChange(
      client,
      ingestRunId,
      "routes",
      "insert",
      { id: routeId },
      null,
      { id: routeId, name, type, signboard, source_relation_id: sourceRelationId }
    );
    metrics.routesInserted += 1;
  }
  return routeId;
}

async function upsertRouteShape(client, routeId, shapeCoords, ingestRunId, metrics) {
  if (shapeCoords.length === 0) return;
  const before = await client.query(
    "SELECT seq,latitude,longitude FROM route_shape_points WHERE route_id=$1 ORDER BY seq;",
    [routeId]
  );
  await client.query("DELETE FROM route_shape_points WHERE route_id=$1;", [routeId]);
  for (let seq = 1; seq <= shapeCoords.length; seq++) {
    const [lon, lat] = shapeCoords[seq - 1];
    await client.query(
      `INSERT INTO route_shape_points (route_id,seq,latitude,longitude)
       VALUES ($1,$2,$3,$4) ON CONFLICT (route_id,seq) DO UPDATE
       SET latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude;`,
      [routeId, seq, lat, lon]
    );
  }
  const after = await client.query(
    "SELECT seq,latitude,longitude FROM route_shape_points WHERE route_id=$1 ORDER BY seq;",
    [routeId]
  );
  await recordChange(client, ingestRunId, "route_shape_points", "replace_shape", { route_id: routeId },
    { points: before.rows }, { points: after.rows });
  metrics.shapeRoutesReplaced += 1;
  metrics.shapePointsUpserted += shapeCoords.length;
}

function isTransientDbError(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();
  return message.includes("connection terminated") ||
    message.includes("terminating connection due to administrator command") ||
    message.includes("server conn crashed") ||
    message.includes("not queryable") ||
    message.includes("client has encountered a connection error") ||
    message.includes("timeout") ||
    message.includes("deadlock detected") ||
    code === "40P01" ||
    code === "57P01" ||
    code === "57P02" ||
    code === "57P03";
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

async function ingestStopBatchWithRetry(batch, ingestRunId, nodeIdToStopId, metrics) {
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await withTransaction(async (client) => {
        for (const node of batch) {
          const stopId = await upsertStop(client, node, ingestRunId, metrics);
          if (stopId) nodeIdToStopId.set(node.id, stopId);
        }
      });

      return;
    } catch (error) {
      if (attempt < maxAttempts && isTransientDbError(error)) {
        metrics.stopBatchRetries = (metrics.stopBatchRetries || 0) + 1;
        console.warn(`       ↺ Stop batch retry (${attempt}/${maxAttempts}) due to transient DB issue: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        continue;
      }
      throw error;
    }
  }
}

async function ingestRelationWithRetry(relation, ingestRunId, nodeIdToStopId, metrics) {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await withTransaction(async (client) => {
        const routeId = await upsertRoute(client, relation, ingestRunId, metrics);
        if (!routeId) return;

        // Extract route shape first so stop members can be ordered along geometry.
        const shape = extractShapeFromGeom(relation);
        if (shape.length >= 2) {
          await upsertRouteShape(client, routeId, shape, ingestRunId, metrics);
        }

        const rawStopMembers = relationStopMembers(relation);
        const dedupedStopMembers = [];
        const seenRefs = new Set();
        for (const member of rawStopMembers) {
          if (seenRefs.has(member.ref)) continue;
          seenRefs.add(member.ref);
          dedupedStopMembers.push(member);
        }

        const orderedStopMembers = orderStopMembersByShape(dedupedStopMembers, shape);

        // Rebuild route->stop links to keep stop_order coherent across re-imports.
        await client.query("DELETE FROM route_stops WHERE route_id=$1;", [routeId]);

        let order = 1;
        for (const member of orderedStopMembers) {
          if (!nodeIdToStopId.has(member.ref) && member.lat != null) {
            const tags = member.tags || {};
            const rawName = tags.name || tags.ref || `Stop ${member.ref}`;
            const name = normalizeStopName(rawName);
            const type = stopTypeFromTags(tags);
            const ins = await client.query(
              "INSERT INTO stops (name,latitude,longitude,type) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id;",
              [name, member.lat, member.lon, type]
            );
            if (ins.rows[0]?.id) {
              nodeIdToStopId.set(member.ref, Number(ins.rows[0].id));
              metrics.stopsInserted += 1;
            }
          }
          const stopId = nodeIdToStopId.get(member.ref);
          if (!stopId) continue;

          const ins = await client.query(
            `INSERT INTO route_stops (route_id,stop_id,stop_order)
             VALUES ($1,$2,$3) ON CONFLICT (route_id,stop_id) DO NOTHING;`,
            [routeId, stopId, order]
          );
          if (ins.rowCount > 0) {
            await recordChange(client, ingestRunId, "route_stops", "insert",
              { route_id: routeId, stop_id: stopId }, null,
              { route_id: routeId, stop_id: stopId, stop_order: order });
            metrics.routeStopsInserted += 1;
          }
          order += 1;
        }
      });

      return;
    } catch (error) {
      if (attempt < maxAttempts && isTransientDbError(error)) {
        metrics.relationRetries = (metrics.relationRetries || 0) + 1;
        console.warn(`       ↺ Route relation retry (${attempt}/${maxAttempts}) due to transient DB issue: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        continue;
      }
      throw error;
    }
  }
}

async function acquireImportLock() {
  const result = await pool.query("SELECT pg_try_advisory_lock($1) AS locked;", [IMPORT_LOCK_KEY]);
  const locked = Boolean(result.rows[0]?.locked);
  if (!locked) {
    throw new Error("Another import is already running. Please wait for it to finish.");
  }
}

async function releaseImportLock() {
  try {
    await pool.query("SELECT pg_advisory_unlock($1);", [IMPORT_LOCK_KEY]);
  } catch {
    // Ignore unlock failures on shutdown.
  }
}

// ─── Per-cell import ────────────────────────────────────────────────────────
async function importCell(cellBbox, limitPerCell, ingestRunId, nodeIdToStopId, metrics) {
  console.log(`  📦  Cell ${cellBbox} — fetching stops…`);

  // ── 1. Stops ────────────────────────────────────────────────────────────
  const stopQuery = buildStopQuery(cellBbox, limitPerCell);
  let stopData;
  try {
    stopData = await fetchOverpass(stopQuery);
  } catch (err) {
    console.warn(`  ⚠️   Stop query failed for cell ${cellBbox}: ${err.message}`);
    stopData = { elements: [] };
  }

  const stopNodes = (stopData.elements || []).filter(
    (el) => el.type === "node" && typeof el.lat === "number"
  );
  console.log(`       Found ${stopNodes.length} stop nodes.`);

  const stopBatches = chunkArray(stopNodes, 20);
  for (const batch of stopBatches) {
    await ingestStopBatchWithRetry(batch, ingestRunId, nodeIdToStopId, metrics);
  }
  metrics.nodesReceived += stopNodes.length;

  // Small pause to be polite to the Overpass server
  await new Promise((r) => setTimeout(r, 2000));

  // ── 2. Routes ───────────────────────────────────────────────────────────
  console.log(`       Fetching routes with geometry…`);
  const routeQuery = buildRouteQuery(cellBbox, Math.max(50, Math.floor(limitPerCell / 3)));
  let routeData;
  try {
    routeData = await fetchOverpass(routeQuery);
  } catch (err) {
    console.warn(`  ⚠️   Route query failed for cell ${cellBbox}: ${err.message}`);
    routeData = { elements: [] };
  }

  const relations = (routeData.elements || []).filter(
    (el) => el.type === "relation" && el.tags?.type === "route"
  );
  console.log(`       Found ${relations.length} route relations.`);
  metrics.relationsReceived += relations.length;

  for (const relation of relations) {
    try {
      await ingestRelationWithRetry(relation, ingestRunId, nodeIdToStopId, metrics);
    } catch (error) {
      console.warn(`       ⚠️  Skipping relation ${relation.id} after retries: ${error.message}`);
      metrics.relationFailures = (metrics.relationFailures || 0) + 1;
    }
  }

  // Pause between cells
  await new Promise((r) => setTimeout(r, 3000));
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function run() {
  const args = parseArgs();
  const region = resolveRegionConfig(args.region, args.bbox);
  const gridCells = buildGrid(region.bbox, args.gridLat, args.gridLng);
  const limitPerCell = Math.max(50, Math.floor(args.limit / gridCells.length));

  console.log(`\n🗺️  PH Commute Guide — Overpass Grid Importer`);
  console.log(`   Region : ${region.regionKey}  (${region.bbox})`);
  console.log(`   Grid   : ${args.gridLat}×${args.gridLng} = ${gridCells.length} cells`);
  console.log(`   Limit  : ${limitPerCell} nodes/cell\n`);

  const metrics = {
    nodesReceived: 0, relationsReceived: 0,
    stopsInserted: 0, stopsUpdated: 0, stopsUnchanged: 0,
    routesInserted: 0, routesUpdated: 0, routesUnchanged: 0,
    routeStopsInserted: 0,
    shapePointsUpserted: 0, shapeRoutesReplaced: 0,
    relationFailures: 0,
    relationRetries: 0,
    stopBatchRetries: 0
  };

  // nodeIdToStopId is shared across cells so cross-cell routes link correctly
  const nodeIdToStopId = new Map();
  let ingestRunId = null;
  let beforeStats = null;
  await acquireImportLock();

  // Start the audit run
  await withTransaction(async (client) => {
    await ensureImporterSchema(client);
    beforeStats = await getGraphStats(client);
    ingestRunId = await startIngestRun(client, {
      regionKey: region.regionKey,
      bbox: region.bbox,
      limit: args.limit
    });
  });

  try {
    for (let i = 0; i < gridCells.length; i++) {
      const cell = gridCells[i];
      console.log(`\n[${i + 1}/${gridCells.length}] Processing cell: ${cell}`);
      await importCell(cell, limitPerCell, ingestRunId, nodeIdToStopId, metrics);
    }

    await refreshRouteGraphEdges();

    const afterStatsResult = await pool.query(`
      SELECT
        (SELECT COUNT(*)::INT FROM stops) AS stops_count,
        (SELECT COUNT(*)::INT FROM routes) AS routes_count,
        (SELECT COUNT(*)::INT FROM route_stops) AS route_stops_count,
        (SELECT COUNT(*)::INT FROM route_graph_edges) AS route_graph_edges_count;
    `);
    const afterRow = afterStatsResult.rows[0] || {};
    const afterStats = {
      stops: Number(afterRow.stops_count || 0),
      routes: Number(afterRow.routes_count || 0),
      routeStops: Number(afterRow.route_stops_count || 0),
      routeGraphEdges: Number(afterRow.route_graph_edges_count || 0)
    };

    metrics.graphStatsBefore = beforeStats;
    metrics.graphStatsAfter = afterStats;
    metrics.graphEdgeGrowth = afterStats.routeGraphEdges - (beforeStats?.routeGraphEdges || 0);

    await withTransaction(async (client) => {
      await finalizeIngestRun(client, ingestRunId, "success", metrics);
    });

    console.log("\n✅  Import complete.");
    console.log(`   Ingest run id : ${ingestRunId}`);
    console.log(`   Stops         : +${metrics.stopsInserted} new, ~${metrics.stopsUpdated} updated, =${metrics.stopsUnchanged} unchanged`);
    console.log(`   Routes        : +${metrics.routesInserted} new, ~${metrics.routesUpdated} updated`);
    console.log(`   Route-stops   : +${metrics.routeStopsInserted} links`);
    console.log(`   Shape points  : ${metrics.shapePointsUpserted} pts across ${metrics.shapeRoutesReplaced} routes`);
    console.log(`   Failed relations : ${metrics.relationFailures}`);
    console.log(`   Relation retries : ${metrics.relationRetries}`);
    console.log(`   Stop batch retries : ${metrics.stopBatchRetries}`);
    console.log(`   Graph edges before/after : ${metrics.graphStatsBefore?.routeGraphEdges || 0} -> ${metrics.graphStatsAfter?.routeGraphEdges || 0}`);
    console.log(`   Graph edge growth : ${metrics.graphEdgeGrowth}`);
  } catch (err) {
    console.error("\n❌  Import failed:", err.message);
    if (ingestRunId) {
      await withTransaction(async (client) => {
        await finalizeIngestRun(client, ingestRunId, "failed", metrics, err.message);
      }).catch(() => {});
    }
    process.exitCode = 1;
  }
}

run().finally(async () => {
  try {
    await releaseImportLock();
  } finally {
    await pool.end();
  }
});
