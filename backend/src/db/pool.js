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
  ssl: resolveSslConfig(env.databaseUrl, env.nodeEnv),
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});

pool.on("error", (error) => {
  console.error("PostgreSQL pool error:", error.message);
});

export async function withTransaction(callback) {
  const client = await pool.connect();
  const onClientError = (error) => {
    console.error("PostgreSQL client error:", error.message);
  };

  client.on("error", onClientError);
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    if (!client.released) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Connection can be terminated by server/proxy; ignore rollback failure.
      }
    }
    throw error;
  } finally {
    client.off("error", onClientError);
    client.release();
  }
}
