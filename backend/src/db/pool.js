import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;

function resolveSslConfig() {
  if (env.databaseSsl === "true") {
    return { rejectUnauthorized: false };
  }

  if (env.databaseSsl === "false") {
    return false;
  }

  const parsed = new URL(env.databaseUrl);
  const host = parsed.hostname.toLowerCase();
  const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "::1";
  return isLocalHost ? false : { rejectUnauthorized: false };
}

export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: resolveSslConfig()
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
