import pino from "pino";

/**
 * Structured JSON logs (one line per event) for Vercel's log drain.
 * Every call to an external service (database, Wikimedia, later the Claude API)
 * goes through `logExternalCall` so it is logged with timing and outcome.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  base: { service: "history-timeline", env: process.env.VERCEL_ENV ?? process.env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  redact: {
    paths: ["*.password", "*.authorization", "*.cookie", "*.apiKey", "*.connectionString"],
    censor: "[redacted]",
  },
});

export type ExternalService = "database" | "wikidata" | "commons" | "wikipedia";

export type ExternalCallContext = {
  service: ExternalService;
  /** Stable name of the operation, e.g. "timeline.load" or "commons.imageinfo". */
  operation: string;
  /** Host or URL being called. Never include credentials. */
  target?: string;
  requestId?: string;
  meta?: Record<string, unknown>;
};

type ErrorLike = { name?: string; message?: string; code?: string; status?: number };

export function serializeError(err: unknown): Record<string, unknown> {
  if (err && typeof err === "object") {
    const e = err as ErrorLike;
    return { name: e.name, message: e.message, code: e.code, status: e.status };
  }
  return { message: String(err) };
}

/**
 * Runs `fn`, logging start (debug), success (info, with duration and a result summary)
 * and failure (error, with duration and error details). Rethrows failures.
 */
export async function logExternalCall<T>(
  ctx: ExternalCallContext,
  fn: () => Promise<T>,
  summarize?: (result: T) => Record<string, unknown>,
): Promise<T> {
  const log = logger.child({
    kind: "external_call",
    service: ctx.service,
    operation: ctx.operation,
    target: ctx.target,
    requestId: ctx.requestId,
    ...ctx.meta,
  });
  const started = performance.now();
  log.debug("external call started");
  try {
    const result = await fn();
    const durationMs = Math.round(performance.now() - started);
    log.info({ durationMs, ok: true, ...(summarize ? summarize(result) : {}) }, "external call succeeded");
    return result;
  } catch (err) {
    const durationMs = Math.round(performance.now() - started);
    log.error({ durationMs, ok: false, err: serializeError(err) }, "external call failed");
    throw err;
  }
}

/** fetch() wrapper for external HTTP APIs: logs method, URL, status, duration and failures. */
export async function loggedFetch(
  ctx: Omit<ExternalCallContext, "target">,
  url: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const u = new URL(url);
  return logExternalCall(
    { ...ctx, target: `${u.origin}${u.pathname}`, meta: { ...ctx.meta, method: init?.method ?? "GET" } },
    async () => {
      const res = await fetch(u, init);
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} from ${u.host}`) as Error & { status: number; retryAfter?: string };
        err.status = res.status;
        err.retryAfter = res.headers.get("retry-after") ?? undefined;
        throw err;
      }
      return res;
    },
    (res) => ({ status: res.status, contentLength: res.headers.get("content-length") }),
  );
}
