import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Keep enough connections for concurrent API requests without starving the
  // PostgreSQL container, which shares the host with the application.
  max: envNumber("PG_POOL_MAX", 20),
  idleTimeoutMillis: envNumber("PG_IDLE_TIMEOUT_MS", 10_000),
  connectionTimeoutMillis: envNumber("PG_CONNECTION_TIMEOUT_MS", 2_000),
  statement_timeout: envNumber("PG_STATEMENT_TIMEOUT_MS", 15_000),
  idle_in_transaction_session_timeout: envNumber("PG_IDLE_TRANSACTION_TIMEOUT_MS", 30_000),
});

export const db = drizzle({ client: pool });
