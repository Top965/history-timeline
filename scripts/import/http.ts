/**
 * Polite HTTP for Wikimedia APIs: identifies itself, limits concurrency,
 * retries network errors, 429 and 5xx with exponential backoff, logs every call,
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
    for (let attempt = 0; ; attempt++) {
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
        const status = (err as { status?: number }).status;
        // Network errors have no status and are worth retrying too.
        const retriable = status == null || status === 429 || status >= 500;
        if (!retriable || attempt >= retries) throw err;
        await new Promise((r) => setTimeout(r, Math.min(2000 * 2 ** attempt, 60_000)));
      }
    }
  }
}

export const chunk = <T>(xs: readonly T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
