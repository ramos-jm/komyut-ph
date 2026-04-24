import { pool } from "../src/db/pool.js";

const sql = `
CREATE TABLE IF NOT EXISTS source_truth_routes (
  id                    BIGSERIAL PRIMARY KEY,
  source                TEXT NOT NULL CHECK (source IN ('ltfrb','dotr','lgu','curated')),
  source_document       TEXT NOT NULL,
  operator_name         TEXT,
  route_code            TEXT,
  route_code_key        TEXT GENERATED ALWAYS AS (COALESCE(route_code, '')) STORED,
  route_name            TEXT NOT NULL,
  mode                  TEXT NOT NULL CHECK (mode IN ('jeep','bus','train','uv','tricycle','ferry')),
  origin_label          TEXT,
  destination_label     TEXT,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','planned','inactive')),
  first_seen_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_validated_at     TIMESTAMP WITH TIME ZONE,
  confidence            TEXT NOT NULL DEFAULT 'unverified' CHECK (confidence IN ('high','medium','low','unverified')),
  raw_payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (source, source_document, route_name, route_code_key)
);

CREATE TABLE IF NOT EXISTS source_truth_advisories (
  id                    BIGSERIAL PRIMARY KEY,
  source                TEXT NOT NULL CHECK (source IN ('dotr','lgu','operator','curated')),
  advisory_title        TEXT NOT NULL,
  advisory_type         TEXT NOT NULL CHECK (advisory_type IN ('reroute','closure','service_update','fare_update','notice')),
  effective_start       TIMESTAMP WITH TIME ZONE,
  effective_end         TIMESTAMP WITH TIME ZONE,
  affected_modes        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  affected_route_labels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  details               TEXT,
  source_url            TEXT,
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  raw_payload           JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS landmark_aliases (
  id                    BIGSERIAL PRIMARY KEY,
  alias_text            TEXT NOT NULL UNIQUE,
  canonical_label       TEXT NOT NULL,
  latitude              DOUBLE PRECISION,
  longitude             DOUBLE PRECISION,
  stop_id               BIGINT NULL REFERENCES stops(id) ON DELETE SET NULL,
  confidence            TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high','medium','low')),
  source                TEXT NOT NULL DEFAULT 'curated' CHECK (source IN ('curated','user','operator','ltfrb','dotr','lgu')),
  verified_at           TIMESTAMP WITH TIME ZONE,
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_corrections (
  id                    BIGSERIAL PRIMARY KEY,
  reporter_name         TEXT,
  reporter_contact      TEXT,
  correction_type       TEXT NOT NULL CHECK (correction_type IN ('missing_route','wrong_transfer_point','fare_mismatch','eta_mismatch','stop_name','stop_location','other')),
  reference_origin      TEXT,
  reference_destination TEXT,
  affected_route_label  TEXT,
  expected_value        TEXT,
  actual_value          TEXT,
  notes                 TEXT,
  evidence_url          TEXT,
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','applied')),
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  reviewed_at           TIMESTAMP WITH TIME ZONE,
  reviewed_by           TEXT,
  review_notes          TEXT
);

CREATE TABLE IF NOT EXISTS benchmark_runs (
  id                    BIGSERIAL PRIMARY KEY,
  benchmark_name        TEXT NOT NULL,
  benchmark_source      TEXT NOT NULL,
  run_started_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  run_completed_at      TIMESTAMP WITH TIME ZONE,
  total_cases           INT NOT NULL DEFAULT 0,
  missing_route_count   INT NOT NULL DEFAULT 0,
  wrong_transfer_count  INT NOT NULL DEFAULT 0,
  fare_mismatch_count   INT NOT NULL DEFAULT 0,
  eta_mismatch_count    INT NOT NULL DEFAULT 0,
  summary               JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS benchmark_case_results (
  id                    BIGSERIAL PRIMARY KEY,
  benchmark_run_id      BIGINT NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
  case_key              TEXT NOT NULL,
  origin_text           TEXT NOT NULL,
  destination_text      TEXT NOT NULL,
  expected_payload      JSONB NOT NULL,
  actual_payload        JSONB,
  missing_route         BOOLEAN NOT NULL DEFAULT FALSE,
  wrong_transfer_point  BOOLEAN NOT NULL DEFAULT FALSE,
  fare_mismatch         BOOLEAN NOT NULL DEFAULT FALSE,
  eta_mismatch          BOOLEAN NOT NULL DEFAULT FALSE,
  notes                 TEXT,
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_source_truth_routes_mode_status
  ON source_truth_routes (mode, status, confidence);

CREATE INDEX IF NOT EXISTS idx_source_truth_routes_updated
  ON source_truth_routes (last_validated_at DESC);

CREATE INDEX IF NOT EXISTS idx_source_truth_advisories_effective
  ON source_truth_advisories (effective_start DESC, effective_end DESC);

CREATE INDEX IF NOT EXISTS idx_landmark_aliases_alias_trgm
  ON landmark_aliases USING GIN (alias_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_user_corrections_status_created
  ON user_corrections (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_benchmark_runs_started
  ON benchmark_runs (run_started_at DESC);

CREATE INDEX IF NOT EXISTS idx_benchmark_case_results_run
  ON benchmark_case_results (benchmark_run_id, case_key);
`;

async function run() {
  console.log("Applying source-truth schema only...");
  await pool.query(sql);
  console.log("Source-truth schema apply complete.");
}

run()
  .catch((error) => {
    console.error("Source-truth schema apply failed:", error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
