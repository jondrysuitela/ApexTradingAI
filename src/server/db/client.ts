import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "@/server/env";
import * as schema from "@/server/db/schema";

let pool: Pool | null = null;
let dbClient: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDbPool() {
  if (!env.DATABASE_URL) {
    return null;
  }

  pool ??= new Pool({ connectionString: env.DATABASE_URL });
  return pool;
}

export function getDb() {
  if (!env.DATABASE_URL) {
    return null;
  }

  pool ??= new Pool({ connectionString: env.DATABASE_URL });
  dbClient ??= drizzle(pool, { schema });
  return dbClient;
}

export async function checkDatabaseConnection() {
  const db = getDbPool();
  if (!db) {
    return { connected: false, reason: "DATABASE_URL not configured" };
  }

  const result = await db.query("select 1 as ok");
  return { connected: result.rows[0]?.ok === 1 };
}
