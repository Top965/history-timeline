import type { NextRequest } from "next/server";
import { getTimelineTile } from "@/lib/db/queries";
import { isLocale } from "@/lib/i18n/config";
import { logger, serializeError } from "@/lib/log/logger";
import { isValidTile } from "@/lib/timeline/tiles";

/** GET /api/timeline?locale=en&level=3&tile=19 → TimelineTile (smaller events for 1900–1999). */
export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-vercel-id") ?? crypto.randomUUID();
  const params = request.nextUrl.searchParams;
  const locale = params.get("locale") ?? "";
  const level = Number(params.get("level"));
  const tile = Number(params.get("tile"));
  const log = logger.child({ route: "/api/timeline", requestId, locale, level, tile });
  if (!isLocale(locale) || !isValidTile(level, tile, new Date().getUTCFullYear())) {
    return Response.json({ error: "bad request" }, { status: 400, headers: { "x-request-id": requestId } });
  }
  const started = performance.now();
  try {
    const data = await getTimelineTile(locale, level, tile);
    log.info({ durationMs: Math.round(performance.now() - started), events: data.events.length }, "timeline tile");
    return Response.json(data, {
      headers: {
        "cache-control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
        "x-request-id": requestId,
      },
    });
  } catch (err) {
    log.error(
      { durationMs: Math.round(performance.now() - started), err: serializeError(err) },
      "timeline tile failed",
    );
    return Response.json(
      { error: "could not load events" },
      { status: 500, headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  }
}
