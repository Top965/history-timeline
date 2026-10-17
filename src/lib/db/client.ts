import "server-only";
import postgres from "postgres";
import { serverEnv } from "@/lib/env";
import { logExternalCall } from "@/lib/log/logger";

export type Tx = postgres.TransactionSql;

let sql: postgres.Sql | undefined;

function client(): postgres.Sql {
  if (!sql) {
    const env = serverEnv();
    sql = postgres(env.DATABASE_URL, {
      max: env.DATABASE_POOL_MAX,
      // Supabase's transaction pooler (pgbouncer/supavisor) does not support prepared statements.
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
      connection: { application_name: "history-timeline-web" },
      onnotice: () => {},
    });
  }
  return sql;
}

function databaseHost(): string {
  try {
    return new URL(serverEnv().DATABASE_URL).host;
  } catch {
    return "unknown";
  }
}

/**
 * Runs public read queries the way an anonymous visitor would: a read-only
 * transaction as the `anon` role, so Row Level Security decides what is visible
 * (published content only), exactly as it would through Supabase's API.
 */
export async function publicRead<T>(
  operation: string,
  fn: (tx: Tx) => Promise<T>,
  meta?: Record<string, unknown>,
): Promise<T> {
  return logExternalCall(
    { service: "database", operation, target: databaseHost(), meta },
    async () => {
      const result = await client().begin("read only", async (tx) => {
        await tx`set local role anon`;
        await tx`set local statement_timeout = '8s'`;
        return fn(tx);
      });
      return result as T;
    },
    (result) => (Array.isArray(result) ? { rows: result.length } : {}),
  );
}

/** Lightweight connectivity check used by /api/health. */
export async function pingDatabase(requestId: string): Promise<void> {
  await logExternalCall(
    { service: "database", operation: "health.ping", target: databaseHost(), requestId },
    async () => {
      await client()`select 1`;
    },
  );
}
