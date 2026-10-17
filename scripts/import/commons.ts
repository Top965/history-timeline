/**
 * Commons metadata for many files at once (50 per request). Files that are
 * missing or not freely licensed are left out, with a log line saying why.
 */
import { logger } from "@/lib/log/logger";
import {
  COMMONS_API,
  NotFreeError,
  parseImagePage,
  type CommonsFileInfo,
  type ImageInfoResponse,
} from "../commons/commons";
import { chunk, type Http } from "./http";

/** Wikidata stores file names without the "File:" prefix. */
export const commonsTitle = (name: string) => (name.startsWith("File:") ? name : `File:${name}`).replace(/_/g, " ");

export async function getImages(http: Http, names: readonly string[]): Promise<Map<string, CommonsFileInfo>> {
  const out = new Map<string, CommonsFileInfo>();
  const titles = [...new Set(names.map(commonsTitle))].sort();
  await Promise.all(
    chunk(titles, 50).map(async (batch) => {
      const url = new URL(COMMONS_API);
      url.search = new URLSearchParams({
        action: "query",
        format: "json",
        formatversion: "2",
        prop: "imageinfo",
        iiprop: "url|size|mime|extmetadata",
        iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|Credit|AttributionRequired|NonFree",
        titles: batch.join("|"),
      }).toString();
      const res = await http.json<ImageInfoResponse>(url.toString(), {
        service: "commons",
        operation: "commons.imageinfo",
      });
      const renamed = new Map((res.query?.normalized ?? []).map((n) => [n.to, n.from]));
      for (const page of res.query?.pages ?? []) {
        const asked = renamed.get(page.title) ?? page.title;
        try {
          const info = parseImagePage(page);
          if (!/^image\//.test(info.mimeType) || !info.originalUrl.startsWith("https://upload.wikimedia.org/"))
            continue;
          out.set(asked, info);
        } catch (err) {
          const reason = err instanceof NotFreeError ? "not free" : "missing";
          logger.info({ kind: "import", file: asked, reason }, "image skipped");
        }
      }
    }),
  );
  return out;
}
