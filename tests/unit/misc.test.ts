import { describe, expect, it, vi } from "vitest";
import {
  parseTimelineHash,
  requestTimelineJump,
  subscribeTimelineJump,
  timelineHash,
} from "@/components/timeline/jump";
import { commonsFileName, commonsSrcSet, commonsThumbUrl } from "@/lib/commons/thumbnails";
import { dirOf, isLocale, negotiateLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { logExternalCall, loggedFetch } from "@/lib/log/logger";

describe("locale negotiation", () => {
  it("prefers the highest-weighted supported language", () => {
    expect(negotiateLocale("ar-KW,ar;q=0.9,en;q=0.8")).toBe("ar");
    expect(negotiateLocale("fr-FR,fr;q=0.9,en;q=0.8,ar;q=0.7")).toBe("en");
    expect(negotiateLocale("fr,de")).toBe("en");
    expect(negotiateLocale("en;q=0.2, ar;q=0.9")).toBe("ar");
    expect(negotiateLocale(null)).toBe("en");
    expect(negotiateLocale("ar;q=0")).toBe("en");
  });
  it("knows directions and supported locales", () => {
    expect(dirOf("ar")).toBe("rtl");
    expect(dirOf("en")).toBe("ltr");
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });
  it("has the same message keys in every language", () => {
    const keys = (o: object): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k]));
    expect(keys(getMessages("ar")).sort()).toEqual(keys(getMessages("en")).sort());
  });
});

describe("Commons thumbnails", () => {
  const img = {
    commonsFile: "File:Example.jpg",
    originalUrl: "https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg",
    width: 2000,
    height: 1000,
    mimeType: "image/jpeg",
  };
  it("builds hashed thumbnail paths like Commons does", () => {
    expect(commonsFileName("File:The Great Pyramid.jpg")).toBe("The_Great_Pyramid.jpg");
    expect(commonsThumbUrl(img, 960)).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Example.jpg/960px-Example.jpg",
    );
  });
  it("never upscales and renders SVG thumbnails as PNG", () => {
    expect(commonsThumbUrl({ ...img, width: 800 }, 960)).toBe(img.originalUrl);
    expect(commonsThumbUrl({ ...img, commonsFile: "File:Map.svg", mimeType: "image/svg+xml" }, 500)).toMatch(
      /\/500px-Map\.svg\.png$/,
    );
  });
  it("lists standard widths in the srcset", () => {
    const set = commonsSrcSet({ ...img, width: 1000 });
    expect(set).toContain("330px-Example.jpg 330w");
    expect(set).toContain("960px-Example.jpg 960w");
    expect(set).not.toContain("1280px");
    expect(set.endsWith(`${img.originalUrl} 1000w`)).toBe(true);
  });
});

describe("timeline jumps", () => {
  it("round-trips the deep-link hash", () => {
    expect(timelineHash({ center: 1914.4, span: 30 })).toBe("#year=1914&span=30");
    expect(parseTimelineHash("#year=-44&span=40")).toEqual({ center: -44, span: 40 });
    expect(parseTimelineHash("#year=1969")).toEqual({ center: 1969, span: 40 });
    expect(parseTimelineHash("#foo=1")).toBeNull();
    expect(parseTimelineHash("#year=abc")).toBeNull();
  });
  it("delivers a request made before the timeline subscribes", () => {
    requestTimelineJump({ center: 1914, span: 30 });
    const listener = vi.fn();
    const off = subscribeTimelineJump(listener);
    expect(listener).toHaveBeenCalledWith({ center: 1914, span: 30 });
    requestTimelineJump({ center: 1, span: 10 });
    expect(listener).toHaveBeenCalledTimes(2);
    off();
  });
});

describe("external call logging", () => {
  it("returns results and rethrows failures", async () => {
    await expect(logExternalCall({ service: "database", operation: "t.ok" }, async () => 42)).resolves.toBe(42);
    await expect(
      logExternalCall({ service: "database", operation: "t.fail" }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
  it("turns HTTP errors into exceptions with the status", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 503 }));
    await expect(
      loggedFetch({ service: "commons", operation: "t.http" }, "https://commons.wikimedia.org/w/api.php"),
    ).rejects.toMatchObject({
      status: 503,
    });
    fetchMock.mockRestore();
  });
});
