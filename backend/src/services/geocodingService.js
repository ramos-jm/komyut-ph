import fetch from "node-fetch";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";

export async function geocodePlace(text) {
  const normalized = text.trim().toLowerCase();

  const cached = await pool.query(
    `
      SELECT latitude, longitude
      FROM geocode_cache
      WHERE query_text = $1
        AND created_at > NOW() - ($2::text || ' days')::interval
      LIMIT 1;
    `,
    [normalized, env.geocodeTtlDays]
  );

  if (cached.rows.length > 0) {
    return {
      latitude: Number(cached.rows[0].latitude),
      longitude: Number(cached.rows[0].longitude),
      source: "cache"
    };
  }

  const url = new URL("/search", env.nominatimBaseUrl);
  url.searchParams.set("q", text);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ph");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "PH-Commute-Guide/1.0 (educational-project)"
    }
  });

  if (!response.ok) {
    const err = new Error("Nominatim request failed");
    err.status = 502;
    throw err;
  }

  const payload = await response.json();

  if (!Array.isArray(payload) || payload.length === 0) {
    const err = new Error(`No geocoding result for: ${text}`);
    err.status = 404;
    throw err;
  }

  const latitude = Number(payload[0].lat);
  const longitude = Number(payload[0].lon);

  await pool.query(
    `
      INSERT INTO geocode_cache (query_text, latitude, longitude)
      VALUES ($1, $2, $3)
      ON CONFLICT (query_text)
      DO UPDATE SET
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        created_at = NOW();
    `,
    [normalized, latitude, longitude]
  );

  return { latitude, longitude, source: "nominatim" };
}
