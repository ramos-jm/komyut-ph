import { z } from "zod";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";

const submitCorrectionSchema = z.object({
  reporter_name: z.string().max(120).optional(),
  reporter_contact: z.string().max(160).optional(),
  correction_type: z.enum([
    "missing_route",
    "wrong_transfer_point",
    "fare_mismatch",
    "eta_mismatch",
    "stop_name",
    "stop_location",
    "other"
  ]),
  reference_origin: z.string().max(180).optional(),
  reference_destination: z.string().max(180).optional(),
  affected_route_label: z.string().max(220).optional(),
  expected_value: z.string().max(500).optional(),
  actual_value: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  evidence_url: z.string().url().optional()
});

const reviewCorrectionSchema = z.object({
  status: z.enum(["approved", "rejected", "applied"]),
  review_notes: z.string().max(2000).optional(),
  reviewed_by: z.string().max(120).optional()
});

function ensureModerator(req, res) {
  if (!env.moderationApiToken) {
    res.status(503).json({
      error: {
        message: "Moderation API token is not configured"
      }
    });
    return false;
  }

  const token = req.header("x-moderation-token");
  if (!token || token !== env.moderationApiToken) {
    res.status(401).json({
      error: {
        message: "Unauthorized moderation token"
      }
    });
    return false;
  }

  return true;
}

export async function submitCorrection(req, res, next) {
  try {
    const body = submitCorrectionSchema.parse(req.body);

    const result = await pool.query(
      `
        INSERT INTO user_corrections (
          reporter_name,
          reporter_contact,
          correction_type,
          reference_origin,
          reference_destination,
          affected_route_label,
          expected_value,
          actual_value,
          notes,
          evidence_url
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id, correction_type, status, created_at;
      `,
      [
        body.reporter_name || null,
        body.reporter_contact || null,
        body.correction_type,
        body.reference_origin || null,
        body.reference_destination || null,
        body.affected_route_label || null,
        body.expected_value || null,
        body.actual_value || null,
        body.notes || null,
        body.evidence_url || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

export async function listPendingCorrections(req, res, next) {
  try {
    if (!ensureModerator(req, res)) {
      return;
    }

    const result = await pool.query(
      `
        SELECT
          id,
          correction_type,
          reference_origin,
          reference_destination,
          affected_route_label,
          expected_value,
          actual_value,
          notes,
          evidence_url,
          status,
          created_at
        FROM user_corrections
        WHERE status = 'pending'
        ORDER BY created_at DESC
        LIMIT 200;
      `
    );

    res.json({ corrections: result.rows });
  } catch (error) {
    next(error);
  }
}

export async function reviewCorrection(req, res, next) {
  try {
    if (!ensureModerator(req, res)) {
      return;
    }

    const correctionId = Number(req.params.id);
    if (!Number.isInteger(correctionId)) {
      return res.status(400).json({
        error: {
          message: "Invalid correction id"
        }
      });
    }

    const body = reviewCorrectionSchema.parse(req.body);

    const result = await pool.query(
      `
        UPDATE user_corrections
        SET
          status = $2,
          reviewed_at = NOW(),
          reviewed_by = COALESCE($3, reviewed_by),
          review_notes = COALESCE($4, review_notes)
        WHERE id = $1
        RETURNING id, status, reviewed_at, reviewed_by, review_notes;
      `,
      [correctionId, body.status, body.reviewed_by || null, body.review_notes || null]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: {
          message: "Correction not found"
        }
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

export async function getSourceTruthSummary(_req, res, next) {
  try {
    const query = `
      SELECT
        (SELECT COUNT(*) FROM source_truth_routes) AS source_routes,
        (SELECT COUNT(*) FROM source_truth_advisories) AS advisories,
        (SELECT COUNT(*) FROM landmark_aliases) AS aliases,
        (SELECT COUNT(*) FROM user_corrections WHERE status='pending') AS pending_corrections,
        (SELECT COUNT(*) FROM user_corrections) AS total_corrections,
        (SELECT MAX(run_started_at) FROM benchmark_runs) AS last_benchmark_at;
    `;

    const result = await pool.query(query);
    const row = result.rows[0] || {};

    res.json({
      source_routes: Number(row.source_routes || 0),
      advisories: Number(row.advisories || 0),
      aliases: Number(row.aliases || 0),
      pending_corrections: Number(row.pending_corrections || 0),
      total_corrections: Number(row.total_corrections || 0),
      last_benchmark_at: row.last_benchmark_at || null
    });
  } catch (error) {
    next(error);
  }
}
