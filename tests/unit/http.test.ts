import { afterEach, describe, expect, it, vi } from "vitest";
import { Http, retryAfterMs } from "../../scripts/import/http";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const limited = (retryAfter?: string) =>
  new Response("slow down", { status: 429, headers: retryAfter ? { "retry-after": retryAfter } : {} });

describe("retryAfterMs", () => {
  it("reads seconds and HTTP dates", () => {
    expect(retryAfterMs("30")).toBe(30_000);
    expect(retryAfterMs(new Date(61_000).toUTCString(), 1_000)).toBe(60_000);
    expect(retryAfterMs(undefined)).toBeNull();
    expect(retryAfterMs("soon")).toBeNull();
  });
});

describe("Http rate limits", () => {
  it("keeps waiting through 429s even when other retries are used up", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(limited("5"))
      .mockResolvedValueOnce(limited())
      .mockImplementation(async () => new Response(JSON.stringify({ ok: 1 })));
    vi.stubGlobal("fetch", fetch);
    const done = new Http({ cacheDir: null, retries: 0 }).json("https://ar.wikipedia.org/w/api.php?a=1", {
      service: "wikipedia",
      operation: "test",
    });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    // Retry-After said 5 s; the next 429 has none, so the second wait is 20 s.
    await vi.advanceTimersByTimeAsync(1_000 + 20_000);
    await expect(done).resolves.toEqual({ ok: 1 });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("pauses every request to a host that said too many requests", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(limited("20"))
      .mockImplementation(async () => new Response(JSON.stringify({ ok: 1 })));
    vi.stubGlobal("fetch", fetch);
    const http = new Http({ cacheDir: null, retries: 0, concurrency: 1 });
    const o = { service: "wikipedia" as const, operation: "test" };
    const first = http.json("https://ar.wikipedia.org/w/api.php?a=1", o);
    await vi.advanceTimersByTimeAsync(0);
    const second = http.json("https://ar.wikipedia.org/w/api.php?a=2", o);
    await vi.advanceTimersByTimeAsync(19_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  it("gives up after repeated 429s", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => limited("1")),
    );
    const done = new Http({ cacheDir: null }).json("https://ar.wikipedia.org/w/api.php?a=1", {
      service: "wikipedia",
      operation: "test",
    });
    const caught = done.catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await caught).toMatchObject({ status: 429 });
  });
});
