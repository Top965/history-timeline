import { describe, expect, it } from "vitest";
import { NotFreeError, parseImageInfo, stripHtml, type ImageInfoResponse } from "../../scripts/commons/commons";

const response = (meta: Record<string, string>, extra: Partial<{ missing: boolean }> = {}): ImageInfoResponse => ({
  query: {
    pages: [
      {
        title: "File:Kheops-Pyramid.jpg",
        ...extra,
        imageinfo: extra.missing
          ? undefined
          : [
              {
                url: "https://upload.wikimedia.org/wikipedia/commons/e/e3/Kheops-Pyramid.jpg",
                descriptionurl: "https://commons.wikimedia.org/wiki/File:Kheops-Pyramid.jpg",
                width: 2448,
                height: 1836,
                mime: "image/jpeg",
                extmetadata: Object.fromEntries(Object.entries(meta).map(([k, value]) => [k, { value }])),
              },
            ],
      },
    ],
  },
});

describe("Commons metadata", () => {
  it("extracts license and author credit", () => {
    const info = parseImageInfo(
      response({
        LicenseShortName: "CC BY-SA 3.0",
        LicenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
        Artist: '<a href="//commons.wikimedia.org/wiki/User:Nina" title="User:Nina">Nina</a>',
        AttributionRequired: "true",
      }),
    );
    expect(info).toMatchObject({
      commonsFile: "File:Kheops-Pyramid.jpg",
      width: 2448,
      licenseShortName: "CC BY-SA 3.0",
      authorText: "Nina",
      authorUrl: "https://commons.wikimedia.org/wiki/User:Nina",
      attributionRequired: true,
    });
  });

  it("accepts public domain and CC0", () => {
    expect(
      parseImageInfo(response({ LicenseShortName: "Public domain", AttributionRequired: "false" })).attributionRequired,
    ).toBe(false);
    expect(parseImageInfo(response({ LicenseShortName: "CC0" })).authorText).toBe("Unknown author");
  });

  it("refuses non-free and unlicensed files", () => {
    expect(() => parseImageInfo(response({ LicenseShortName: "Fair use", NonFree: "true" }))).toThrow(NotFreeError);
    expect(() => parseImageInfo(response({ LicenseShortName: "All rights reserved" }))).toThrow(NotFreeError);
    expect(() => parseImageInfo(response({}))).toThrow(NotFreeError);
  });

  it("reports missing files", () => {
    expect(() => parseImageInfo(response({}, { missing: true }))).toThrow(/not found/);
  });

  it("strips HTML to plain text", () => {
    expect(stripHtml("<span>Ann &amp; Bob</span>\n<b>Smith</b>")).toBe("Ann & Bob Smith");
  });
});
