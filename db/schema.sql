CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS stops (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('jeep', 'bus', 'train', 'uv')),
  geom GEOGRAPHY(Point, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ) STORED
);

CREATE TABLE IF NOT EXISTS routes (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('jeep', 'bus', 'train', 'uv')),
  signboard TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS route_stops (
  id BIGSERIAL PRIMARY KEY,
  route_id BIGINT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  stop_id BIGINT NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  stop_order INT NOT NULL CHECK (stop_order > 0),
  UNIQUE (route_id, stop_order),
  UNIQUE (route_id, stop_id)
);

CREATE TABLE IF NOT EXISTS route_shape_points (
  id BIGSERIAL PRIMARY KEY,
  route_id BIGINT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  seq INT NOT NULL CHECK (seq > 0),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  UNIQUE (route_id, seq)
);

CREATE TABLE IF NOT EXISTS saved_routes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NULL,
  origin_text TEXT NOT NULL,
  destination_text TEXT NOT NULL,
  route_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS geocode_cache (
  query_text TEXT PRIMARY KEY,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stops_geom_gist ON stops USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_stops_type ON stops (type);
CREATE INDEX IF NOT EXISTS idx_routes_type ON routes (type);
CREATE INDEX IF NOT EXISTS idx_route_stops_route_id_order ON route_stops (route_id, stop_order);
CREATE INDEX IF NOT EXISTS idx_route_stops_stop_id ON route_stops (stop_id);
CREATE INDEX IF NOT EXISTS idx_route_shape_points_route_id_seq ON route_shape_points (route_id, seq);
CREATE INDEX IF NOT EXISTS idx_saved_routes_user_id_created_at ON saved_routes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_routes_route_data_gin ON saved_routes USING GIN (route_data);
CREATE INDEX IF NOT EXISTS idx_geocode_cache_created_at ON geocode_cache (created_at DESC);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  region_key TEXT NOT NULL,
  bbox TEXT NOT NULL,
  import_limit INT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'rolled_back')),
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_text TEXT NULL
);

CREATE TABLE IF NOT EXISTS ingest_run_changes (
  id BIGSERIAL PRIMARY KEY,
  ingest_run_id BIGINT NOT NULL REFERENCES ingest_runs(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete', 'replace_shape')),
  record_key JSONB NOT NULL,
  before_data JSONB NULL,
  after_data JSONB NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingest_runs_started_at ON ingest_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingest_runs_region_status ON ingest_runs (region_key, status);
CREATE INDEX IF NOT EXISTS idx_ingest_run_changes_run ON ingest_run_changes (ingest_run_id);
CREATE INDEX IF NOT EXISTS idx_ingest_run_changes_table_operation ON ingest_run_changes (table_name, operation);
