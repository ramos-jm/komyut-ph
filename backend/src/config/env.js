import dotenv from "dotenv";

dotenv.config();

const required = ["DATABASE_URL"];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  databaseSsl: (process.env.DATABASE_SSL || "auto").toLowerCase(),
  nominatimBaseUrl: process.env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org",
  geocodeTtlDays: Number(process.env.GEOCODE_TTL_DAYS || 30),
  routeSearchRadiusMeters: Number(process.env.ROUTE_SEARCH_RADIUS_METERS || 1000),
  routeSearchRadiiMeters: (process.env.ROUTE_SEARCH_RADII_METERS || "500,1000,1500,2500")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0),
  routeSearchMinStops: Number(process.env.ROUTE_SEARCH_MIN_STOPS || 3),
  routeSearchStopLimit: Number(process.env.ROUTE_SEARCH_STOP_LIMIT || 40),
  routeMaxTransfers: Number(process.env.ROUTE_MAX_TRANSFERS || 4),
  routeMaxNodeVisits: Number(process.env.ROUTE_MAX_NODE_VISITS || 8000),
  routeSearchGraphBufferKm: Number(process.env.ROUTE_SEARCH_GRAPH_BUFFER_KM || 12),
  moderationApiToken: process.env.MODERATION_API_TOKEN || "",
  benchmarkApiBaseUrl: process.env.BENCHMARK_API_BASE_URL || `http://localhost:${Number(process.env.PORT || 4000)}/api`,
  importDefaultRegion: process.env.IMPORT_DEFAULT_REGION || "metro-manila",
  importDefaultBbox: process.env.IMPORT_DEFAULT_BBOX || "14.35,120.85,14.83,121.20",
  importDefaultLimit: Number(process.env.IMPORT_DEFAULT_LIMIT || 500)
};
