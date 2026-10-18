import type { NextRequest } from "next/server";
import { isLocale } from "@/lib/i18n/config";
import { logger, serializeError } from "@/lib/log/logger";
import { findCandidates } from "@/lib/people/lookup";

/** GET /api/people/lookup?locale=en&q=lionel → { candidates } people and articles on Wikidata not found by the site's search. */
export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-vercel-id") ?? crypto.randomUUID();
  const params = request.nextUrl.searchParams;
  const locale = params.get("locale") ?? "";
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const log = logger.child({ route: "/api/people/lookup", requestId, locale });
  if (!isLocale(locale) || q.length < 2) {
    return Response.json({ error: "bad request" }, { status: 400, headers: { "x-request-id": requestId } });
  }
  const started = performance.now();
  try {
    const candidates = await findCandidates(locale, q);
    log.info({ durationMs: Math.round(performance.now() - started), q, candidates: candidates.length }, "lookup");
    return Response.json(
      { candidates },
      {
        headers: {
          "cache-control": "public, max-age=60, s-maxage=600, stale-while-revalidate=3600",
          "x-request-id": requestId,
        },
      },
    );
  } catch (err) {
    log.error({ durationMs: Math.round(performance.now() - started), q, err: serializeError(err) }, "lookup failed");
    return Response.json(
      { error: "lookup failed" },
      { status: 502, headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  }
}
