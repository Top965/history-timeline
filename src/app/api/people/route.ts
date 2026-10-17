import type { NextRequest } from "next/server";
import { z } from "zod";
import { logger, serializeError } from "@/lib/log/logger";
import { addPerson, clientHash } from "@/lib/people/lookup";

const Body = z.object({ wikidataId: z.string().regex(/^Q[1-9]\d{0,11}$/) });

/** POST /api/people { wikidataId } → { slug } after adding that person from Wikidata. */
export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-vercel-id") ?? crypto.randomUUID();
  const log = logger.child({ route: "/api/people", requestId });
  const headers = { "cache-control": "no-store", "x-request-id": requestId };

  // Only this site's own pages may add people.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.nextUrl.host) {
    log.warn({ origin }, "add person refused: other origin");
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400, headers });

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const started = performance.now();
  try {
    const result = await addPerson(parsed.data.wikidataId, clientHash(ip));
    const durationMs = Math.round(performance.now() - started);
    log.info({ durationMs, wikidataId: parsed.data.wikidataId, result }, "add person");
    if (result.ok) return Response.json({ slug: result.slug, created: result.created }, { headers });
    const status = result.reason === "rate-limited" ? 429 : 422;
    return Response.json({ error: result.reason }, { status, headers });
  } catch (err) {
    log.error(
      {
        durationMs: Math.round(performance.now() - started),
        wikidataId: parsed.data.wikidataId,
        err: serializeError(err),
      },
      "add person failed",
    );
    return Response.json({ error: "failed" }, { status: 502, headers });
  }
}
