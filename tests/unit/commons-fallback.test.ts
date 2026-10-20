import { describe, expect, it } from "vitest";
import { COMMONS_HOST, IMAGE_FALLBACK_SCRIPT, viaSite } from "@/lib/commons/fallback";

class FakeImage {
  dataset: Record<string, string> = {};
  src = "";
  srcset = "";
  currentSrc = "";
}

function install() {
  let onError: (e: { target: unknown }) => void = () => {};
  let capture = false;
  const document = {
    addEventListener: (type: string, fn: typeof onError, useCapture: boolean) => {
      expect(type).toBe("error");
      onError = fn;
      capture = useCapture;
    },
  };
  new Function("document", "HTMLImageElement", IMAGE_FALLBACK_SCRIPT)(document, FakeImage);
  return { fail: (target: unknown) => onError({ target }), capture: () => capture };
}

describe("Wikimedia pictures through this site", () => {
  const file = `${COMMONS_HOST}commons/thumb/a/ab/Kuwait.jpg/500px-Kuwait.jpg`;

  it("rewrites only Wikimedia file addresses", () => {
    expect(viaSite(file)).toBe("/commons/wikipedia/commons/thumb/a/ab/Kuwait.jpg/500px-Kuwait.jpg");
    expect(viaSite("https://example.com/a.jpg")).toBe("https://example.com/a.jpg");
  });

  it("retries a picture that failed to load, once, through the site", () => {
    const page = install();
    expect(page.capture()).toBe(true);
    const img = new FakeImage();
    img.src = img.currentSrc = file;
    img.srcset = `${file} 500w, ${COMMONS_HOST}commons/a/ab/Kuwait.jpg 800w`;
    page.fail(img);
    expect(img.src).toBe(viaSite(file));
    expect(img.srcset).toBe(`${viaSite(file)} 500w, /commons/wikipedia/commons/a/ab/Kuwait.jpg 800w`);

    // A second failure is final: no loop.
    img.src = img.currentSrc = file;
    page.fail(img);
    expect(img.src).toBe(file);

    const other = new FakeImage();
    other.src = other.currentSrc = "https://example.com/a.jpg";
    page.fail(other);
    expect(other.src).toBe("https://example.com/a.jpg");
    page.fail({});
  });
});
