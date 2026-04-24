import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { pool } from "../src/db/pool.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, "..", "data", "source-truth");

function parseCsvRow(line) {
  const out = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      out.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  out.push(current.trim());
  return out;
}

async function readCsv(filePath) {
  const content = await fs.readFile(filePath, "utf-8");
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  if (!lines.length) return [];

  const headers = parseCsvRow(lines[0]);
  const rows = [];

  for (const rawLine of lines.slice(1)) {
    const values = parseCsvRow(rawLine);
    const row = {};

    for (let i = 0; i < headers.length; i += 1) {
      row[headers[i]] = values[i] || "";
    }

    rows.push(row);
  }

  return rows;
}

function parseTextArray(value) {
  if (!value) return [];
  return String(value)
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function importRoutes(filePath) {
  const rows = await readCsv(filePath);
  if (!rows.length) return 0;

  let imported = 0;

  for (const row of rows) {
    await pool.query(
      `
        INSERT INTO source_truth_routes (
          source,
          source_document,
          operator_name,
          route_code,
          route_name,
          mode,
          origin_label,
          destination_label,
          status,
          last_validated_at,
          confidence,
          raw_payload
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
        ON CONFLICT (source, source_document, route_name, route_code_key) DO UPDATE
        SET
          operator_name = EXCLUDED.operator_name,
          mode = EXCLUDED.mode,
          origin_label = EXCLUDED.origin_label,
          destination_label = EXCLUDED.destination_label,
          status = EXCLUDED.status,
          last_validated_at = EXCLUDED.last_validated_at,
          confidence = EXCLUDED.confidence,
          raw_payload = EXCLUDED.raw_payload;
      `,
      [
        row.source || "ltfrb",
        row.source_document || "manual-import",
        row.operator_name || null,
        row.route_code || null,
        row.route_name,
        row.mode || "jeep",
        row.origin_label || null,
        row.destination_label || null,
        row.status || "active",
        row.last_validated_at || null,
        row.confidence || "unverified",
        JSON.stringify(row)
      ]
    );

    imported += 1;
  }

  return imported;
}

async function importAdvisories(filePath) {
  const rows = await readCsv(filePath);
  if (!rows.length) return 0;

  let imported = 0;

  for (const row of rows) {
    await pool.query(
      `
        INSERT INTO source_truth_advisories (
          source,
          advisory_title,
          advisory_type,
          effective_start,
          effective_end,
          affected_modes,
          affected_route_labels,
          details,
          source_url,
          raw_payload
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb);
      `,
      [
        row.source || "dotr",
        row.advisory_title,
        row.advisory_type || "notice",
        row.effective_start || null,
        row.effective_end || null,
        parseTextArray(row.affected_modes),
        parseTextArray(row.affected_route_labels),
        row.details || null,
        row.source_url || null,
        JSON.stringify(row)
      ]
    );

    imported += 1;
  }

  return imported;
}

async function importAliases(filePath) {
  const rows = await readCsv(filePath);
  if (!rows.length) return 0;

  let imported = 0;

  for (const row of rows) {
    await pool.query(
      `
        INSERT INTO landmark_aliases (
          alias_text,
          canonical_label,
          latitude,
          longitude,
          confidence,
          source,
          verified_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (alias_text) DO UPDATE
        SET
          canonical_label = EXCLUDED.canonical_label,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          confidence = EXCLUDED.confidence,
          source = EXCLUDED.source,
          verified_at = EXCLUDED.verified_at;
      `,
      [
        row.alias_text,
        row.canonical_label,
        row.latitude ? Number(row.latitude) : null,
        row.longitude ? Number(row.longitude) : null,
        row.confidence || "medium",
        row.source || "curated",
        row.verified_at || null
      ]
    );

    imported += 1;
  }

  return imported;
}

async function maybeImport(fileName, importer) {
  const fullPath = path.join(dataDir, fileName);
  try {
    await fs.access(fullPath);
  } catch {
    console.log(`- Skipping ${fileName} (file not found)`);
    return 0;
  }

  const count = await importer(fullPath);
  console.log(`- Imported ${count} rows from ${fileName}`);
  return count;
}

async function run() {
  console.log("\nSource-of-truth import\n");

  const routeCount = await maybeImport("ltfrb_routes.csv", importRoutes);
  const advisoryCount = await maybeImport("transport_advisories.csv", importAdvisories);
  const aliasCount = await maybeImport("landmark_aliases.csv", importAliases);

  console.log("\nImport summary:");
  console.log(`  routes: ${routeCount}`);
  console.log(`  advisories: ${advisoryCount}`);
  console.log(`  aliases: ${aliasCount}`);
}

run()
  .catch((error) => {
    console.error("Source-of-truth import failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
