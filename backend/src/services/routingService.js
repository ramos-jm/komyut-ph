import { env } from "../config/env.js";
import {
  findNearbyStops,
  getTransitGraph
} from "../repositories/transitRepository.js";
import { estimateWalkMinutes } from "../utils/geo.js";

const MAX_TRANSFERS = 2;
const MAX_NODE_VISITS = 15000;

const MODE_BASE_FARE = {
  jeep: 13,
  bus: 15,
  uv: 25,
  train: 20
};

function buildRideSteps(pathEdges, stopsById) {
  if (pathEdges.length === 0) {
    return [];
  }

  const segments = [];
  let currentSegment = {
    routeId: pathEdges[0].routeId,
    routeType: pathEdges[0].routeType,
    signboard: pathEdges[0].signboard,
    fromStopId: pathEdges[0].fromStopId,
    toStopId: pathEdges[0].toStopId,
    stopCount: 1
  };

  for (let i = 1; i < pathEdges.length; i += 1) {
    const edge = pathEdges[i];
    if (edge.routeId === currentSegment.routeId) {
      currentSegment.toStopId = edge.toStopId;
      currentSegment.stopCount += 1;
      continue;
    }

    segments.push(currentSegment);
    currentSegment = {
      routeId: edge.routeId,
      routeType: edge.routeType,
      signboard: edge.signboard,
      fromStopId: edge.fromStopId,
      toStopId: edge.toStopId,
      stopCount: 1
    };
  }
  segments.push(currentSegment);

  return segments.map((segment) => {
    const fromStop = stopsById.get(segment.fromStopId);
    const toStop = stopsById.get(segment.toStopId);

    return {
      mode: segment.routeType,
      signboard: segment.signboard,
      instruction: `Sakay ng ${segment.routeType} na may signboard na "${segment.signboard}" mula ${fromStop?.name || "origin stop"} hanggang ${toStop?.name || "destination stop"}.`,
      from: fromStop?.name || "Unknown stop",
      to: toStop?.name || "Unknown stop",
      estimatedStops: segment.stopCount
    };
  });
}

function summarizeCandidate(candidate, context) {
  const {
    originText,
    destinationText,
    originStops,
    destinationStops,
    stopsById
  } = context;

  const rideSteps = buildRideSteps(candidate.pathEdges, stopsById);

  const startDistance = originStops.find((stop) => stop.id === candidate.startStopId)?.distance_m || 0;
  const endDistance = destinationStops.find((stop) => stop.id === candidate.endStopId)?.distance_m || 0;

  const walkStartMinutes = estimateWalkMinutes(startDistance);
  const walkEndMinutes = estimateWalkMinutes(endDistance);

  const transitMinutes = candidate.pathEdges.length * 2;
  const transferPenalty = candidate.transfers * 5;
  const estimatedMinutes = walkStartMinutes + transitMinutes + transferPenalty + walkEndMinutes;

  const estimatedFare = rideSteps.reduce((total, step) => total + (MODE_BASE_FARE[step.mode] || 15), 0);

  const steps = [
    {
      mode: "walk",
      instruction: `Maglakad ng humigit-kumulang ${walkStartMinutes} minuto papunta sa ${stopsById.get(candidate.startStopId)?.name || "nearest stop"}.`,
      from: originText,
      to: stopsById.get(candidate.startStopId)?.name || "Nearest stop"
    },
    ...rideSteps,
    {
      mode: "walk",
      instruction: `Maglakad ng humigit-kumulang ${walkEndMinutes} minuto papunta sa destinasyon.`,
      from: stopsById.get(candidate.endStopId)?.name || "Drop-off stop",
      to: destinationText
    }
  ];

  const pathCoordinates = [];
  if (candidate.pathEdges.length > 0) {
    const firstStop = stopsById.get(candidate.pathEdges[0].fromStopId);
    if (firstStop) {
      pathCoordinates.push([Number(firstStop.longitude), Number(firstStop.latitude)]);
    }

    for (const edge of candidate.pathEdges) {
      const stop = stopsById.get(edge.toStopId);
      if (stop) {
        pathCoordinates.push([Number(stop.longitude), Number(stop.latitude)]);
      }
    }
  }

  return {
    steps,
    estimatedMinutes,
    estimatedFare,
    transfers: candidate.transfers,
    pathCoordinates
  };
}

function pickRouteOptions(candidates) {
  if (candidates.length === 0) {
    return [];
  }

  const fastest = [...candidates].sort((a, b) => a.estimatedMinutes - b.estimatedMinutes)[0];
  const leastTransfers = [...candidates].sort((a, b) => {
    if (a.transfers !== b.transfers) {
      return a.transfers - b.transfers;
    }
    return a.estimatedMinutes - b.estimatedMinutes;
  })[0];
  const cheapest = [...candidates].sort((a, b) => a.estimatedFare - b.estimatedFare)[0];

  const options = [
    { key: "fastest", item: fastest },
    { key: "least_transfers", item: leastTransfers },
    { key: "cheapest", item: cheapest }
  ];

  const seen = new Set();
  return options
    .filter(({ item }) => {
      const signature = JSON.stringify(item.steps);
      if (seen.has(signature)) {
        return false;
      }
      seen.add(signature);
      return true;
    })
    .map(({ key, item }) => ({
      type: key,
      ...item
    }));
}

export async function searchCommuteRoutes({ originText, destinationText, originCoords, destinationCoords }) {
  const [originStops, destinationStops, graph] = await Promise.all([
    findNearbyStops({
      lat: originCoords.latitude,
      lng: originCoords.longitude,
      radiusMeters: env.routeSearchRadiusMeters
    }),
    findNearbyStops({
      lat: destinationCoords.latitude,
      lng: destinationCoords.longitude,
      radiusMeters: env.routeSearchRadiusMeters
    }),
    getTransitGraph()
  ]);

  if (originStops.length === 0 || destinationStops.length === 0) {
    return { routes: [] };
  }

  const destinationSet = new Set(destinationStops.map((stop) => stop.id));

  const queue = [];
  const visited = new Map();
  const candidates = [];

  for (const originStop of originStops) {
    const initialState = {
      currentStopId: originStop.id,
      currentRouteId: null,
      transfers: 0,
      pathEdges: [],
      startStopId: originStop.id
    };
    queue.push(initialState);
    visited.set(`${originStop.id}|none|0`, 0);
  }

  let visits = 0;

  while (queue.length > 0 && visits < MAX_NODE_VISITS && candidates.length < 20) {
    const state = queue.shift();
    visits += 1;

    if (destinationSet.has(state.currentStopId) && state.pathEdges.length > 0) {
      candidates.push({
        ...state,
        endStopId: state.currentStopId
      });
      continue;
    }

    const edges = graph.adjacency.get(state.currentStopId) || [];

    for (const edge of edges) {
      const willTransfer = state.currentRouteId && state.currentRouteId !== edge.routeId;
      const transfers = state.transfers + (willTransfer ? 1 : 0);

      if (transfers > MAX_TRANSFERS) {
        continue;
      }

      const nextPath = [...state.pathEdges, edge];
      const key = `${edge.toStopId}|${edge.routeId}|${transfers}`;
      const existingPathLength = visited.get(key);

      if (existingPathLength !== undefined && existingPathLength <= nextPath.length) {
        continue;
      }

      visited.set(key, nextPath.length);

      queue.push({
        currentStopId: edge.toStopId,
        currentRouteId: edge.routeId,
        transfers,
        pathEdges: nextPath,
        startStopId: state.startStopId
      });
    }
  }

  const scored = candidates.map((candidate) => summarizeCandidate(candidate, {
    originText,
    destinationText,
    originStops,
    destinationStops,
    stopsById: graph.stopsById
  }));

  return {
    routes: pickRouteOptions(scored),
    meta: {
      candidateCount: candidates.length,
      searchedStops: {
        origin: originStops.length,
        destination: destinationStops.length
      }
    }
  };
}
