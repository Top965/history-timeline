import type { NextRequest } from "next/server";
import { isLocale } from "@/lib/i18n/config";
import { logger, serializeError } from "@/lib/log/logger";
import { searchSite } from "@/lib/search/server";

export const MAX_QUERY = 100;

/** GET /api/search?locale=en&q=saddam → { results: SearchResult[] } */
export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-vercel-id") ?? crypto.randomUUID();
  const params = request.nextUrl.searchParams;
  const locale = params.get("locale") ?? "";
  const q = (params.get("q") ?? "").trim().slice(0, MAX_QUERY);
  const log = logger.child({ route: "/api/search", requestId, locale });
  if (!isLocale(locale)) {
    return Response.json({ error: "unknown locale" }, { status: 400, headers: { "x-request-id": requestId } });
  }
  const started = performance.now();
  try {
    const results = q ? await searchSite(locale, q) : [];
    log.info({ durationMs: Math.round(performance.now() - started), results: results.length, q }, "search");
    return Response.json(
      { results },
      {
        headers: {
          // Same question, same answer for everyone: let the CDN keep it a while.
          "cache-control": "public, max-age=60, s-maxage=600, stale-while-revalidate=3600",
          "x-request-id": requestId,
        },
      },
    );
  } catch (err) {
    log.error({ durationMs: Math.round(performance.now() - started), err: serializeError(err) }, "search failed");
    return Response.json(
      { error: "search failed" },
      { status: 500, headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  }
}
