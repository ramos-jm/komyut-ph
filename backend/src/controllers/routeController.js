import { z } from "zod";
import { pool } from "../db/pool.js";
import { getRouteById, findNearbyStops, searchStopsByName } from "../repositories/transitRepository.js";
import { geocodePlace } from "../services/geocodingService.js";
import { searchCommuteRoutes } from "../services/routingService.js";

const searchSchema = z.object({
  origin: z.string().min(3),
  destination: z.string().min(3)
});

const nearbySchema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  radius: z.coerce.number().min(100).max(2000).optional()
});

const saveSchema = z.object({
  user_id: z.number().int().nullable().optional(),
  origin_text: z.string().min(3),
  destination_text: z.string().min(3),
  route_data: z.any()
});

const searchStopsSchema = z.object({
  q: z.string().min(1).max(100)
});

export async function searchRoute(req, res, next) {
  try {
    const { origin, destination } = searchSchema.parse(req.query);

    const [originCoords, destinationCoords] = await Promise.all([
      geocodePlace(origin),
      geocodePlace(destination)
    ]);

    const result = await searchCommuteRoutes({
      originText: origin,
      destinationText: destination,
      originCoords,
      destinationCoords
    });

    res.json({
      origin: { text: origin, ...originCoords },
      destination: { text: destination, ...destinationCoords },
      ...result
    });
  } catch (error) {
    next(error);
  }
}

export async function getNearbyStops(req, res, next) {
  try {
    const { lat, lng, radius } = nearbySchema.parse(req.query);
    const stops = await findNearbyStops({
      lat,
      lng,
      radiusMeters: radius || 1000
    });
    res.json({ stops });
  } catch (error) {
    next(error);
  }
}

export async function searchStops(req, res, next) {
  try {
    const { q } = searchStopsSchema.parse(req.query);
    const stops = await searchStopsByName(q, 15);
    res.json({ stops });
  } catch (error) {
    next(error);
  }
}

export async function getRouteDetails(req, res, next) {
  try {
    const routeId = Number(req.params.id);
    if (!Number.isInteger(routeId)) {
      return res.status(400).json({ error: { message: "Invalid route id" } });
    }

    const route = await getRouteById(routeId);
    if (!route) {
      return res.status(404).json({ error: { message: "Route not found" } });
    }

    res.json(route);
  } catch (error) {
    next(error);
  }
}

export async function saveRoute(req, res, next) {
  try {
    const body = saveSchema.parse(req.body);

    const result = await pool.query(
      `
        INSERT INTO saved_routes (user_id, origin_text, destination_text, route_data)
        VALUES ($1, $2, $3, $4)
        RETURNING id, user_id, origin_text, destination_text, route_data, created_at;
      `,
      [body.user_id || null, body.origin_text, body.destination_text, body.route_data]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

export async function getSavedRoutes(_req, res, next) {
  try {
    const result = await pool.query(
      `
        SELECT id, user_id, origin_text, destination_text, route_data, created_at
        FROM saved_routes
        ORDER BY created_at DESC
        LIMIT 100;
      `
    );

    res.json({ routes: result.rows });
  } catch (error) {
    next(error);
  }
}

export async function getTrainInfo(_req, res) {
  res.json({
    lines: [
      {
        line: "LRT-1",
        firstTrip: "05:00",
        lastTrip: "22:15"
      },
      {
        line: "LRT-2",
        firstTrip: "05:00",
        lastTrip: "21:30"
      },
      {
        line: "MRT-3",
        firstTrip: "04:30",
        lastTrip: "22:30"
      }
    ],
    disclaimer: "Reference schedule only. Verify updates from official operators."
  });
}
