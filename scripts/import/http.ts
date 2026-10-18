/**
 * Polite HTTP for Wikimedia APIs: identifies itself, limits concurrency,
 * retries network errors, 429 and 5xx with exponential backoff, backs off the
 * whole host when it says "too many requests", logs every call,
 * and caches responses on disk so a re-run does not refetch.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loggedFetch, type ExternalService } from "@/lib/log/logger";
import { USER_AGENT } from "../commons/commons";

export type FetchOptions = {
  service: ExternalService;
  operation: string;
  /** Form body; sent as POST (used for long SPARQL queries). */
  form?: Record<string, string>;
  accept?: string;
};

export class Http {
  private active = 0;
  private queue: (() => void)[] = [];
  /** When a host answers 429, every request to it waits until this time. */
  private pausedUntil = new Map<string, number>();

  constructor(
    private readonly opts: { cacheDir: string | null; concurrency?: number; retries?: number } = { cacheDir: null },
  ) {}

  private async slot<T>(fn: () => Promise<T>): Promise<T> {
    const limit = this.opts.concurrency ?? 4;
    if (this.active >= limit) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }

  private cachePath(url: string, form?: Record<string, string>): string | null {
    if (!this.opts.cacheDir) return null;
    const key = createHash("sha1")
      .update(url + (form ? JSON.stringify(form) : ""))
      .digest("hex");
    return path.join(this.opts.cacheDir, key.slice(0, 2), `${key}.json`);
  }

  async json<T>(url: string, o: FetchOptions): Promise<T> {
    const file = this.cachePath(url, o.form);
    if (file) {
      try {
        return JSON.parse(await readFile(file, "utf8")) as T;
      } catch {
        // not cached yet
      }
    }
    const body = await this.slot(() => this.fetchWithRetry(url, o));
    const parsed = JSON.parse(body) as T;
    if (file) {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body);
    }
    return parsed;
  }

  private async fetchWithRetry(url: string, o: FetchOptions): Promise<string> {
    const retries = this.opts.retries ?? 5;
    const host = new URL(url).host;
    for (let attempt = 0, limited = 0; ; attempt++) {
      const wait = (this.pausedUntil.get(host) ?? 0) - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        // loggedFetch logs the call and throws (with .status) on non-2xx responses.
        const res = await loggedFetch({ service: o.service, operation: o.operation, meta: { attempt } }, url, {
          method: o.form ? "POST" : "GET",
          headers: {
            "user-agent": USER_AGENT,
            accept: o.accept ?? "application/json",
            ...(o.form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
          },
          body: o.form ? new URLSearchParams(o.form).toString() : undefined,
        });
        return await res.text();
      } catch (err) {
        const { status, retryAfter } = err as { status?: number; retryAfter?: string };
        if (status === 429) {
          // Rate limits clear with time, so they get more patience than other errors,
          // and the pause applies to every request to that host, not just this one.
          if (++limited > RATE_LIMIT_RETRIES) throw err;
          attempt--;
          const ms = Math.min(retryAfterMs(retryAfter) ?? 10_000 * 2 ** (limited - 1), 300_000);
          this.pausedUntil.set(host, Math.max(this.pausedUntil.get(host) ?? 0, Date.now() + ms));
          continue;
        }
        // Network errors have no status and are worth retrying too.
        const retriable = status == null || status >= 500;
        if (!retriable || attempt >= retries) throw err;
        await sleep(Math.min(2000 * 2 ** attempt, 60_000));
      }
    }
  }
}

const RATE_LIMIT_RETRIES = 10;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry-After is either seconds or an HTTP date. */
export function retryAfterMs(value: string | undefined, now = Date.now()): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

export const chunk = <T>(xs: readonly T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
