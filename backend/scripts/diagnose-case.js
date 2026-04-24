import { geocodePlace } from "../src/services/geocodingService.js";
import { searchCommuteRoutes } from "../src/services/routingService.js";
import {
  findNearbyStops,
  getTransitGraph,
  getTransitGraphWithinBounds
} from "../src/repositories/transitRepository.js";
import { pool } from "../src/db/pool.js";

function kmToDegreeDelta(km) {
  return km / 111;
}

function buildSearchBounds(originCoords, destinationCoords, bufferKm = 12) {
  const latBuffer = kmToDegreeDelta(bufferKm);
  const minLat = Math.min(originCoords.latitude, destinationCoords.latitude) - latBuffer;
  const maxLat = Math.max(originCoords.latitude, destinationCoords.latitude) + latBuffer;

  const midLat = (originCoords.latitude + destinationCoords.latitude) / 2;
  const safeCos = Math.max(0.2, Math.abs(Math.cos((midLat * Math.PI) / 180)));
  const lngBuffer = latBuffer / safeCos;
  const minLng = Math.min(originCoords.longitude, destinationCoords.longitude) - lngBuffer;
  const maxLng = Math.max(originCoords.longitude, destinationCoords.longitude) + lngBuffer;

  return { minLat, maxLat, minLng, maxLng };
}

function bfsReachable(graph, startIds, destinationSet, maxVisits = 100000) {
  const queue = [...startIds];
  const visited = new Set(startIds);

  let visits = 0;
  while (queue.length && visits < maxVisits) {
    const stopId = queue.shift();
    visits += 1;

    if (destinationSet.has(stopId)) {
      return { found: true, visits };
    }

    const edges = graph.adjacency.get(stopId) || [];
    for (const edge of edges) {
      if (!visited.has(edge.toStopId)) {
        visited.add(edge.toStopId);
        queue.push(edge.toStopId);
      }
    }
  }

  return { found: false, visits };
}

async function run() {
  const originText = process.argv[2] || "Quiapo";
  const destinationText = process.argv[3] || "SM Fairview";

  const [originCoords, destinationCoords] = await Promise.all([
    geocodePlace(originText),
    geocodePlace(destinationText)
  ]);

  console.log("Origin geocode:", originText, originCoords);
  console.log("Destination geocode:", destinationText, destinationCoords);

  const [originStops, destinationStops] = await Promise.all([
    findNearbyStops({ lat: originCoords.latitude, lng: originCoords.longitude, radiusMeters: 1500, limit: 50 }),
    findNearbyStops({ lat: destinationCoords.latitude, lng: destinationCoords.longitude, radiusMeters: 1500, limit: 50 })
  ]);

  console.log("Origin nearby stops:", originStops.length, originStops.slice(0, 5).map((s) => `${s.id}:${s.name}`));
  console.log("Destination nearby stops:", destinationStops.length, destinationStops.slice(0, 5).map((s) => `${s.id}:${s.name}`));

  const bounds = buildSearchBounds(originCoords, destinationCoords, 12);
  const [boundedGraph, fullGraph] = await Promise.all([
    getTransitGraphWithinBounds(bounds),
    getTransitGraph()
  ]);

  console.log("Bounded graph nodes:", boundedGraph.stopsById.size, "adjacency keys:", boundedGraph.adjacency.size);
  console.log("Full graph nodes:", fullGraph.stopsById.size, "adjacency keys:", fullGraph.adjacency.size);

  const originIds = originStops.map((s) => s.id);
  const destinationSet = new Set(destinationStops.map((s) => s.id));

  const boundedReach = bfsReachable(boundedGraph, originIds, destinationSet);
  const fullReach = bfsReachable(fullGraph, originIds, destinationSet);

  console.log("Reachable in bounded graph:", boundedReach);
  console.log("Reachable in full graph:", fullReach);

  const edgeStats = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM route_stops)::INT AS route_stops,
      (SELECT COUNT(*) FROM route_graph_edges)::INT AS route_graph_edges,
      (SELECT COUNT(*) FROM routes)::INT AS routes;
  `);
  console.log("Edge stats:", edgeStats.rows[0]);

  const serviceResult = await searchCommuteRoutes({
    originText,
    destinationText,
    originCoords,
    destinationCoords
  });

  console.log("Service routes found:", serviceResult.routes?.length || 0);
  console.log("Service meta:", serviceResult.meta || {});
  for (const route of serviceResult.routes || []) {
    console.log(`- ${route.type}: transfers=${route.transfers}, steps=${route.steps?.length || 0}, pathCoordinates=${route.pathCoordinates?.length || 0}, mapSegments=${route.mapSegments?.length || 0}`);
  }
}

run()
  .catch((error) => {
    console.error("Diagnosis failed:", error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
