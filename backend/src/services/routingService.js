import { env } from "../config/env.js";
import {
  findNearbyStops,
  getRouteShapePointsMap,
  getTransitGraph,
  getTransitGraphWithinBounds
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

function kmToDegreeDelta(km) {
  return km / 111;
}

function buildSearchBounds(originCoords, destinationCoords, bufferKm) {
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

function coordDistanceSquared(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function nearestIndex(shapeCoords, target) {
  let minIndex = 0;
  let minDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < shapeCoords.length; i += 1) {
    const dist = coordDistanceSquared(shapeCoords[i], target);
    if (dist < minDistance) {
      minDistance = dist;
      minIndex = i;
    }
  }

  return minIndex;
}

function buildFallbackSegmentCoordinates(rideStep, candidate, stopsById) {
  const slice = candidate.pathEdges.slice(rideStep.edgeStartIndex, rideStep.edgeEndIndex + 1);
  if (slice.length === 0) {
    return [];
  }

  const firstStop = stopsById.get(slice[0].fromStopId);
  if (!firstStop) {
    return [];
  }

  const coordinates = [[Number(firstStop.longitude), Number(firstStop.latitude)]];
  for (const edge of slice) {
    const stop = stopsById.get(edge.toStopId);
    if (stop) {
      coordinates.push([Number(stop.longitude), Number(stop.latitude)]);
    }
  }
  return coordinates;
}

function buildSegmentCoordinates(rideStep, candidate, stopsById, routeShapePointsMap) {
  const fromStop = stopsById.get(rideStep.fromStopId);
  const toStop = stopsById.get(rideStep.toStopId);
  const shapeCoords = routeShapePointsMap.get(Number(rideStep.routeId));

  if (!fromStop || !toStop || !shapeCoords || shapeCoords.length < 2) {
    return buildFallbackSegmentCoordinates(rideStep, candidate, stopsById);
  }

  const fromCoord = [Number(fromStop.longitude), Number(fromStop.latitude)];
  const toCoord = [Number(toStop.longitude), Number(toStop.latitude)];

  const fromIdx = nearestIndex(shapeCoords, fromCoord);
  const toIdx = nearestIndex(shapeCoords, toCoord);

  if (fromIdx === toIdx) {
    return buildFallbackSegmentCoordinates(rideStep, candidate, stopsById);
  }

  const sliced = fromIdx < toIdx
    ? shapeCoords.slice(fromIdx, toIdx + 1)
    : [...shapeCoords.slice(toIdx, fromIdx + 1)].reverse();

  return sliced.length >= 2
    ? sliced
    : buildFallbackSegmentCoordinates(rideStep, candidate, stopsById);
}

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
    stopCount: 1,
    edgeStartIndex: 0,
    edgeEndIndex: 0
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
      stopCount: 1,
      edgeStartIndex: i,
      edgeEndIndex: i
    };
  }
  segments.push(currentSegment);

  // Keep edge ranges so map rendering can trace each ride segment through all intermediate stops.
  for (const segment of segments) {
    segment.edgeEndIndex = segment.edgeStartIndex + segment.stopCount - 1;
  }

  return segments.map((segment) => {
    const fromStop = stopsById.get(segment.fromStopId);
    const toStop = stopsById.get(segment.toStopId);

    return {
      mode: segment.routeType,
      signboard: segment.signboard,
      routeId: segment.routeId,
      fromStopId: segment.fromStopId,
      toStopId: segment.toStopId,
      edgeStartIndex: segment.edgeStartIndex,
      edgeEndIndex: segment.edgeEndIndex,
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
    stopsById,
    routeShapePointsMap
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

  const mapSegments = rideSteps
    .map((rideStep, index) => {
      const coordinates = buildSegmentCoordinates(rideStep, candidate, stopsById, routeShapePointsMap);

      if (coordinates.length < 2) {
        return null;
      }

      return {
        mode: rideStep.mode,
        signboard: rideStep.signboard,
        from: rideStep.from,
        to: rideStep.to,
        instruction: rideStep.instruction,
        segmentIndex: index + 1,
        coordinates
      };
    })
    .filter(Boolean);

  const pathCoordinates = [];
  for (const segment of mapSegments) {
    if (pathCoordinates.length === 0) {
      pathCoordinates.push(segment.coordinates[0]);
      continue;
    }

    for (const coord of segment.coordinates) {
      const prev = pathCoordinates[pathCoordinates.length - 1];
      if (!prev || prev[0] !== coord[0] || prev[1] !== coord[1]) {
        pathCoordinates.push(coord);
      }
    }
  }

  const mapMarkers = [];
  if (mapSegments.length > 0) {
    mapMarkers.push({
      kind: "start",
      label: "Start",
      stop: mapSegments[0].from,
      coordinates: mapSegments[0].coordinates[0],
      instruction: steps[0]?.instruction || `Start at ${mapSegments[0].from}.`
    });

    for (const segment of mapSegments) {
      mapMarkers.push({
        kind: "ride_start",
        label: "Ride",
        stop: segment.from,
        coordinates: segment.coordinates[0],
        instruction: segment.instruction
      });

      mapMarkers.push({
        kind: "ride_end",
        label: "Get off",
        stop: segment.to,
        coordinates: segment.coordinates[segment.coordinates.length - 1],
        instruction: `Bumaba sa ${segment.to}.`
      });
    }

    for (let i = 1; i < mapSegments.length; i += 1) {
      const previous = mapSegments[i - 1];
      const current = mapSegments[i];
      const hasTransfer =
        previous.signboard !== current.signboard || previous.mode !== current.mode;

      if (hasTransfer) {
        mapMarkers.push({
          kind: "transfer",
          label: "Transfer",
          stop: current.from,
          coordinates: current.coordinates[0],
          instruction: `Transfer at ${current.from}. Then ${current.instruction}`
        });
      }
    }

    mapMarkers.push({
      kind: "end",
      label: "End",
      stop: mapSegments[mapSegments.length - 1].to,
      coordinates: mapSegments[mapSegments.length - 1].coordinates[mapSegments[mapSegments.length - 1].coordinates.length - 1],
      instruction: steps[steps.length - 1]?.instruction || `Arrive near ${mapSegments[mapSegments.length - 1].to}.`
    });
  }

  return {
    steps,
    estimatedMinutes,
    estimatedFare,
    transfers: candidate.transfers,
    pathCoordinates,
    mapSegments,
    mapMarkers
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
  const bounds = buildSearchBounds(originCoords, destinationCoords, env.routeSearchGraphBufferKm);

  const [originStops, destinationStops, boundedGraph, routeShapePointsMap] = await Promise.all([
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
    getTransitGraphWithinBounds(bounds),
    getRouteShapePointsMap()
  ]);

  const graphNeedsFallback =
    boundedGraph.stopsById.size === 0 ||
    boundedGraph.adjacency.size === 0 ||
    !originStops.some((stop) => boundedGraph.stopsById.has(stop.id)) ||
    !destinationStops.some((stop) => boundedGraph.stopsById.has(stop.id));

  const graph = graphNeedsFallback ? await getTransitGraph() : boundedGraph;

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
    stopsById: graph.stopsById,
    routeShapePointsMap
  }));

  return {
    routes: pickRouteOptions(scored),
    meta: {
      candidateCount: candidates.length,
      graphScope: graphNeedsFallback ? "full_fallback" : "bounded",
      searchedStops: {
        origin: originStops.length,
        destination: destinationStops.length
      }
    }
  };
}
