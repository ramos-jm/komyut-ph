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
  routeSearchGraphBufferKm: Number(process.env.ROUTE_SEARCH_GRAPH_BUFFER_KM || 12),
  importDefaultRegion: process.env.IMPORT_DEFAULT_REGION || "metro-manila",
  importDefaultBbox: process.env.IMPORT_DEFAULT_BBOX || "14.35,120.85,14.83,121.20",
  importDefaultLimit: Number(process.env.IMPORT_DEFAULT_LIMIT || 500)
};
