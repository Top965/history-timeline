import { connection } from "next/server";
import { pingDatabase } from "@/lib/db/client";
import { logger, serializeError } from "@/lib/log/logger";

/** Uptime check: confirms the app can reach the database. */
export async function GET(request: Request) {
  await connection();
  const requestId = request.headers.get("x-vercel-id") ?? crypto.randomUUID();
  const log = logger.child({ route: "/api/health", requestId });
  const started = performance.now();
  try {
    await pingDatabase(requestId);
    const durationMs = Math.round(performance.now() - started);
    log.info({ durationMs, status: 200 }, "health check passed");
    return Response.json(
      { status: "ok", database: "ok" },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (err) {
    const durationMs = Math.round(performance.now() - started);
    log.error({ durationMs, status: 503, err: serializeError(err) }, "health check failed");
    return Response.json(
      { status: "error", database: "unreachable" },
      { status: 503, headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  }
}
