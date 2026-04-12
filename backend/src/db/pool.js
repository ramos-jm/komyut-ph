import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;

function resolveSslConfig(databaseUrl, nodeEnv) {
  const databaseSsl = process.env.DATABASE_SSL;

  if (databaseSsl === "false") {
    return false;
  }

  if (databaseSsl === "true") {
    return { rejectUnauthorized: false };
  }

  try {
    const parsed = new URL(databaseUrl);
    const sslMode = parsed.searchParams.get("sslmode");

    if (sslMode && sslMode !== "disable") {
      return { rejectUnauthorized: false };
    }

    if (parsed.hostname.endsWith(".neon.tech")) {
      return { rejectUnauthorized: false };
    }
  } catch {
    // Use environment defaults below when URL parsing fails.
  }

  return nodeEnv === "production" ? { rejectUnauthorized: false } : false;
}

export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: resolveSslConfig(env.databaseUrl, env.nodeEnv)
});

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
