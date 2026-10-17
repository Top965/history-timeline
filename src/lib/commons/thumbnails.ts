import "server-only";
import { createHash } from "node:crypto";

/**
 * Wikimedia Commons thumbnail URLs. Images load straight from upload.wikimedia.org,
 * so there is no image storage or optimization cost.
 *
 * Commons serves pre-rendered thumbnails at a fixed set of widths; requesting
 * other widths is slower and rate limited, so we only ask for these.
 */
export const COMMONS_THUMB_WIDTHS = [330, 500, 960, 1280, 1920] as const;

/** "File:Some image.jpg" -> "Some_image.jpg" */
export function commonsFileName(commonsFile: string): string {
  return commonsFile
    .replace(/^File:/, "")
    .trim()
    .replace(/ /g, "_");
}

/**
 * Thumbnail URL for a file at a width. Returns the original when the requested
 * width is not smaller than the original (Commons will not upscale).
 */
export function commonsThumbUrl(
  image: { commonsFile: string; originalUrl: string; width: number; mimeType: string },
  width: number,
): string {
  if (width >= image.width) return image.originalUrl;
  const name = commonsFileName(image.commonsFile);
  const hash = createHash("md5").update(name).digest("hex");
  const encoded = encodeURIComponent(name);
  // SVG, TIFF and PDF thumbnails are rendered to PNG/JPEG.
  const suffix = image.mimeType === "image/svg+xml" ? ".png" : image.mimeType === "image/tiff" ? ".jpg" : "";
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${hash[0]}/${hash.slice(0, 2)}/${encoded}/${width}px-${encoded}${suffix}`;
}

/** srcset with every standard width smaller than the original, plus the original. */
export function commonsSrcSet(image: {
  commonsFile: string;
  originalUrl: string;
  width: number;
  mimeType: string;
}): string {
  const widths = COMMONS_THUMB_WIDTHS.filter((w) => w < image.width);
  const entries = widths.map((w) => `${commonsThumbUrl(image, w)} ${w}w`);
  if (image.mimeType !== "image/svg+xml" && image.mimeType !== "image/tiff")
    entries.push(`${image.originalUrl} ${image.width}w`);
  return entries.join(", ");
}
