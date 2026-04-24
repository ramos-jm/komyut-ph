import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  const input = entries.get("input") || path.resolve(__dirname, "..", "data", "manual-routes", "pitx-sm-fairview.json");
  const output = entries.get("output") || input.replace(/\.json$/i, ".generated.json");

  return { input, output };
}

async function geocodeCheckpoint(name) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", `${name}, Philippines`);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ph");

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "PH-Commute-ManualRouteGenerator/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Geocoding failed for ${name}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload) || !payload.length) {
    throw new Error(`No geocoding result for checkpoint: ${name}`);
  }

  return {
    name,
    latitude: Number(payload[0].lat),
    longitude: Number(payload[0].lon)
  };
}

async function buildSegmentCoordinates(from, to) {
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${coords}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "PH-Commute-ManualRouteGenerator/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`OSRM segment build failed: ${from.name} -> ${to.name}`);
  }

  const payload = await response.json();
  const route = payload?.routes?.[0];
  const coordinates = route?.geometry?.coordinates;

  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error(`No geometry for segment: ${from.name} -> ${to.name}`);
  }

  return coordinates;
}

function mergeCoordinates(segments) {
  const merged = [];

  for (const segment of segments) {
    for (const coord of segment) {
      const last = merged[merged.length - 1];
      if (!last || last[0] !== coord[0] || last[1] !== coord[1]) {
        merged.push(coord);
      }
    }
  }

  return merged;
}

async function run() {
  const { input, output } = parseArgs();
  const raw = await fs.readFile(input, "utf-8");
  const spec = JSON.parse(raw);

  if (!Array.isArray(spec.checkpoints) || spec.checkpoints.length < 2) {
    throw new Error("Input route spec must include at least 2 checkpoints");
  }

  const resolvedCheckpoints = [];
  for (const cp of spec.checkpoints) {
    if (typeof cp === "string") {
      resolvedCheckpoints.push(await geocodeCheckpoint(cp));
      continue;
    }

    if (cp?.latitude != null && cp?.longitude != null && cp?.name) {
      resolvedCheckpoints.push({
        name: cp.name,
        latitude: Number(cp.latitude),
        longitude: Number(cp.longitude)
      });
      continue;
    }

    if (cp?.name) {
      resolvedCheckpoints.push(await geocodeCheckpoint(cp.name));
      continue;
    }

    throw new Error("Invalid checkpoint entry. Use string or {name, latitude, longitude}");
  }

  const segmentGeometries = [];
  for (let i = 0; i < resolvedCheckpoints.length - 1; i += 1) {
    const from = resolvedCheckpoints[i];
    const to = resolvedCheckpoints[i + 1];
    const geometry = await buildSegmentCoordinates(from, to);
    segmentGeometries.push(geometry);
  }

  const shapeCoordinates = mergeCoordinates(segmentGeometries);

  const generated = {
    ...spec,
    generatedAt: new Date().toISOString(),
    checkpoints: resolvedCheckpoints,
    shapeCoordinates
  };

  await fs.writeFile(output, `${JSON.stringify(generated, null, 2)}\n`, "utf-8");

  console.log("Manual route geometry generated:");
  console.log(`  input: ${input}`);
  console.log(`  output: ${output}`);
  console.log(`  checkpoints: ${resolvedCheckpoints.length}`);
  console.log(`  shape points: ${shapeCoordinates.length}`);
}

run().catch((error) => {
  console.error("Manual route generation failed:", error.message || error);
  process.exitCode = 1;
});
