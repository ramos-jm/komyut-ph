-- ============================================================
-- PH Commute Guide — Database Schema (scale-ready)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- trigram index for fast ILIKE search

-- ── Stops ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stops (
  id        BIGSERIAL PRIMARY KEY,
  name      TEXT NOT NULL,
  latitude  DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  type      TEXT NOT NULL CHECK (type IN ('jeep','bus','train','uv')),
  geom      GEOGRAPHY(Point,4326) GENERATED ALWAYS AS (
              ST_SetSRID(ST_MakePoint(longitude,latitude),4326)::geography
            ) STORED
);

-- ── Routes ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS routes (
  id        BIGSERIAL PRIMARY KEY,
  name      TEXT NOT NULL,
  type      TEXT NOT NULL CHECK (type IN ('jeep','bus','train','uv')),
  signboard TEXT NOT NULL
);

-- ── Route ↔ Stop membership ──────────────────────────────────
CREATE TABLE IF NOT EXISTS route_stops (
  id         BIGSERIAL PRIMARY KEY,
  route_id   BIGINT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  stop_id    BIGINT NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  stop_order INT NOT NULL CHECK (stop_order > 0),
  UNIQUE (route_id, stop_order),
  UNIQUE (route_id, stop_id)
);

-- ── Route shape geometry ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS route_shape_points (
  id        BIGSERIAL PRIMARY KEY,
  route_id  BIGINT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  seq       INT NOT NULL CHECK (seq > 0),
  latitude  DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  UNIQUE (route_id, seq)
);

-- ── User saved routes ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_routes (
  id               BIGSERIAL PRIMARY KEY,
  user_id          BIGINT NULL,
  origin_text      TEXT NOT NULL,
  destination_text TEXT NOT NULL,
  route_data       JSONB NOT NULL,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ── Geocode cache ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geocode_cache (
  query_text TEXT PRIMARY KEY,
  latitude   DOUBLE PRECISION NOT NULL,
  longitude  DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ── Ingest audit ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingest_runs (
  id           BIGSERIAL PRIMARY KEY,
  source       TEXT NOT NULL,
  region_key   TEXT NOT NULL,
  bbox         TEXT NOT NULL,
  import_limit INT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('running','success','failed','rolled_back')),
  started_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE NULL,
  metrics      JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_text   TEXT NULL
);

CREATE TABLE IF NOT EXISTS ingest_run_changes (
  id            BIGSERIAL PRIMARY KEY,
  ingest_run_id BIGINT NOT NULL REFERENCES ingest_runs(id) ON DELETE CASCADE,
  table_name    TEXT NOT NULL,
  operation     TEXT NOT NULL CHECK (operation IN ('insert','update','delete','replace_shape')),
  record_key    JSONB NOT NULL,
  before_data   JSONB NULL,
  after_data    JSONB NULL,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================

-- Spatial lookup (most critical — used by every route search)
CREATE INDEX IF NOT EXISTS idx_stops_geom_gist ON stops USING GIST (geom);

-- Type filter
CREATE INDEX IF NOT EXISTS idx_stops_type ON stops (type);
CREATE INDEX IF NOT EXISTS idx_routes_type ON routes (type);

-- Route-stop graph traversal
CREATE INDEX IF NOT EXISTS idx_route_stops_route_id_order ON route_stops (route_id, stop_order);
CREATE INDEX IF NOT EXISTS idx_route_stops_stop_id        ON route_stops (stop_id);
CREATE INDEX IF NOT EXISTS idx_route_stops_route_id       ON route_stops (route_id);

-- Shape rendering
CREATE INDEX IF NOT EXISTS idx_route_shape_points_route_seq ON route_shape_points (route_id, seq);

-- Stop name search  ← trigram index enables fast ILIKE '%query%'
CREATE INDEX IF NOT EXISTS idx_stops_name_trgm ON stops USING GIN (name gin_trgm_ops);

-- Route signboard / name search
CREATE INDEX IF NOT EXISTS idx_routes_signboard_trgm ON routes USING GIN (signboard gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_routes_name_trgm      ON routes USING GIN (name gin_trgm_ops);

-- Saved routes
CREATE INDEX IF NOT EXISTS idx_saved_routes_user_created ON saved_routes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_routes_data_gin     ON saved_routes USING GIN (route_data);

-- Geocode cache expiry
CREATE INDEX IF NOT EXISTS idx_geocode_cache_created ON geocode_cache (created_at DESC);

-- Ingest audit
CREATE INDEX IF NOT EXISTS idx_ingest_runs_started     ON ingest_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingest_runs_region      ON ingest_runs (region_key, status);
CREATE INDEX IF NOT EXISTS idx_ingest_changes_run      ON ingest_run_changes (ingest_run_id);
CREATE INDEX IF NOT EXISTS idx_ingest_changes_table_op ON ingest_run_changes (table_name, operation);

-- ============================================================
-- Bounded graph query helper view
-- (pre-joins route_stops so the routing service can filter
--  by bounding box without repeated large scans)
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS route_graph_edges AS
SELECT
  rs1.stop_id        AS from_stop_id,
  rs2.stop_id        AS to_stop_id,
  r.id               AS route_id,
  r.name             AS route_name,
  r.type             AS route_type,
  r.signboard,
  s1.latitude        AS from_lat,
  s1.longitude       AS from_lng,
  s2.latitude        AS to_lat,
  s2.longitude       AS to_lng
FROM route_stops rs1
JOIN route_stops rs2
  ON rs1.route_id = rs2.route_id
  AND rs2.stop_order = rs1.stop_order + 1
JOIN routes r  ON r.id  = rs1.route_id
JOIN stops  s1 ON s1.id = rs1.stop_id
JOIN stops  s2 ON s2.id = rs2.stop_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_route_graph_edges_pk
  ON route_graph_edges (from_stop_id, to_stop_id, route_id);

CREATE INDEX IF NOT EXISTS idx_route_graph_edges_from_loc
  ON route_graph_edges (from_lat, from_lng);

CREATE INDEX IF NOT EXISTS idx_route_graph_edges_to_loc
  ON route_graph_edges (to_lat, to_lng);

-- Refresh this view after every import:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY route_graph_edges;
