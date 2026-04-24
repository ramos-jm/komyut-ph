import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { env } from "../src/config/env.js";
import { pool } from "../src/db/pool.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const caseFilePath = path.resolve(__dirname, "..", "data", "benchmark", "public_cases.json");

function hasExpectedTransfer(route, expectedTransferPoint) {
  if (!expectedTransferPoint) return false;
  const needle = String(expectedTransferPoint).toLowerCase();

  return (route?.steps || []).some((step) => {
    const instruction = String(step?.instruction || "").toLowerCase();
    const from = String(step?.from || "").toLowerCase();
    const to = String(step?.to || "").toLowerCase();
    return instruction.includes(needle) || from.includes(needle) || to.includes(needle);
  });
}

function evaluateCase(expected, actualRoute) {
  const hasRoute = Boolean(actualRoute);
  const missingRoute = Boolean(expected.has_route) && !hasRoute;

  const wrongTransferPoint = Boolean(expected.transfer_point) && hasRoute
    ? !hasExpectedTransfer(actualRoute, expected.transfer_point)
    : false;

  const fare = Number(actualRoute?.estimatedFare || 0);
  const eta = Number(actualRoute?.estimatedMinutes || 0);

  const fareMismatch = expected.fare_min != null && expected.fare_max != null && hasRoute
    ? fare < Number(expected.fare_min) || fare > Number(expected.fare_max)
    : false;

  const etaMismatch = expected.eta_min != null && expected.eta_max != null && hasRoute
    ? eta < Number(expected.eta_min) || eta > Number(expected.eta_max)
    : false;

  return {
    missingRoute,
    wrongTransferPoint,
    fareMismatch,
    etaMismatch
  };
}

async function run() {
  const raw = await fs.readFile(caseFilePath, "utf-8");
  const cases = JSON.parse(raw);

  if (!Array.isArray(cases) || !cases.length) {
    throw new Error("Benchmark case file is empty");
  }

  const runIns = await pool.query(
    `
      INSERT INTO benchmark_runs (benchmark_name, benchmark_source)
      VALUES ($1, $2)
      RETURNING id;
    `,
    ["sakay_public_comparison", "public-visible-reference"]
  );

  const benchmarkRunId = Number(runIns.rows[0].id);
  const totals = {
    totalCases: 0,
    missingRoute: 0,
    wrongTransfer: 0,
    fareMismatch: 0,
    etaMismatch: 0
  };

  for (const testCase of cases) {
    totals.totalCases += 1;

    const url = new URL(`${env.benchmarkApiBaseUrl}/search-route`);
    url.searchParams.set("origin", testCase.origin_text);
    url.searchParams.set("destination", testCase.destination_text);

    let actualPayload = null;
    try {
      const response = await fetch(url.toString(), {
        headers: {
          "User-Agent": "PH-Commute-Benchmark/1.0"
        }
      });

      if (response.ok) {
        actualPayload = await response.json();
      }
    } catch {
      // Keep actual payload null for benchmark visibility.
    }

    const actualRoute = actualPayload?.routes?.[0] || null;
    const verdict = evaluateCase(testCase.expected || {}, actualRoute);

    if (verdict.missingRoute) totals.missingRoute += 1;
    if (verdict.wrongTransferPoint) totals.wrongTransfer += 1;
    if (verdict.fareMismatch) totals.fareMismatch += 1;
    if (verdict.etaMismatch) totals.etaMismatch += 1;

    await pool.query(
      `
        INSERT INTO benchmark_case_results (
          benchmark_run_id,
          case_key,
          origin_text,
          destination_text,
          expected_payload,
          actual_payload,
          missing_route,
          wrong_transfer_point,
          fare_mismatch,
          eta_mismatch,
          notes
        )
        VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11);
      `,
      [
        benchmarkRunId,
        testCase.case_key || `case-${totals.totalCases}`,
        testCase.origin_text,
        testCase.destination_text,
        JSON.stringify(testCase.expected || {}),
        JSON.stringify(actualPayload || {}),
        verdict.missingRoute,
        verdict.wrongTransferPoint,
        verdict.fareMismatch,
        verdict.etaMismatch,
        testCase.notes || null
      ]
    );
  }

  const summary = {
    total_cases: totals.totalCases,
    missing_route: totals.missingRoute,
    wrong_transfer_point: totals.wrongTransfer,
    fare_mismatch: totals.fareMismatch,
    eta_mismatch: totals.etaMismatch,
    disagreement_rate: totals.totalCases
      ? Number(((totals.missingRoute + totals.wrongTransfer + totals.fareMismatch + totals.etaMismatch) / totals.totalCases).toFixed(4))
      : 0
  };

  await pool.query(
    `
      UPDATE benchmark_runs
      SET
        run_completed_at = NOW(),
        total_cases = $2,
        missing_route_count = $3,
        wrong_transfer_count = $4,
        fare_mismatch_count = $5,
        eta_mismatch_count = $6,
        summary = $7::jsonb
      WHERE id = $1;
    `,
    [
      benchmarkRunId,
      totals.totalCases,
      totals.missingRoute,
      totals.wrongTransfer,
      totals.fareMismatch,
      totals.etaMismatch,
      JSON.stringify(summary)
    ]
  );

  console.log("Benchmark completed:");
  console.log(JSON.stringify(summary, null, 2));
}

run()
  .catch((error) => {
    console.error("Benchmark failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
