import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CommonsFigure } from "@/components/story/CommonsFigure";

const image = {
  commonsFile: "File:Example.jpg",
  filePageUrl: "https://commons.wikimedia.org/wiki/File:Example.jpg",
  originalUrl: "https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg",
  width: 2000,
  height: 1000,
  mimeType: "image/jpeg",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  author: "Jane Doe",
  authorUrl: "https://commons.wikimedia.org/wiki/User:Jane",
  caption: "A caption",
  alt: "Alt text",
};

describe("CommonsFigure", () => {
  it("loads the Commons thumbnail and credits author, license and source", () => {
    const html = renderToStaticMarkup(<CommonsFigure locale="en" kind="photo" caption="fallback" image={image} />);
    expect(html).toContain(
      'src="https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Example.jpg/960px-Example.jpg"',
    );
    expect(html).toContain('alt="Alt text"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain(">Jane Doe</a>");
    expect(html).toContain('rel="license noopener noreferrer"');
    expect(html).toContain(">CC BY-SA 4.0</a>");
    expect(html).toContain(">Wikimedia Commons</a>");
    expect(html).toContain("A caption");
  });

  it("shows the striped placeholder until an image is attached", () => {
    const html = renderToStaticMarkup(<CommonsFigure locale="ar" kind="map" caption="Europe, 1914" image={null} />);
    expect(html).toContain("placeholder-stripes");
    expect(html).toContain('aria-label="Europe, 1914"');
    expect(html).toContain("خريطة أرشيفية");
    expect(html).not.toContain("<img");
  });
});
