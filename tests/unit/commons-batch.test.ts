import { afterEach, describe, expect, it, vi } from "vitest";
import { getImages } from "../../scripts/import/commons";
import { Http } from "../../scripts/import/http";

afterEach(() => vi.unstubAllGlobals());

describe("getImages", () => {
  it("sends file names in the request body, not the URL", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ query: { pages: [] } })));
    vi.stubGlobal("fetch", fetch);
    const names = Array.from({ length: 50 }, (_, i) => `立場新聞記者被襲擊一刻 ${i} (cropped).jpg`);
    await getImages(new Http({ cacheDir: null, retries: 0 }), names);
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.method).toBe("POST");
    expect(String(url)).toBe("https://commons.wikimedia.org/w/api.php");
    expect(new URLSearchParams(String(init.body)).get("titles")).toContain("立場新聞記者被襲擊一刻 0 (cropped).jpg");
  });

  it("skips a batch Commons refuses instead of failing the import", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("too long", { status: 414 })),
    );
    await expect(getImages(new Http({ cacheDir: null, retries: 0 }), ["A.jpg"])).resolves.toEqual(new Map());
  });
});
