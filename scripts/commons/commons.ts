/**
 * Wikimedia Commons metadata: fetch a file's size, URL, license and author,
 * and decide whether we may use it. Non-free files are always rejected.
 */
import { loggedFetch } from "@/lib/log/logger";

export const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
// Wikimedia asks API clients to identify themselves: https://meta.wikimedia.org/wiki/User-Agent_policy
export const USER_AGENT = "HistoryTimeline/0.1 (https://github.com/Top965/history-timeline)";

type ExtValue = { value?: string };
export type ImageInfoPage = {
  title: string;
  missing?: boolean;
  imageinfo?: {
    url: string;
    descriptionurl: string;
    width: number;
    height: number;
    mime: string;
    extmetadata?: Record<string, ExtValue | undefined>;
  }[];
};
export type ImageInfoResponse = {
  query?: {
    normalized?: { from: string; to: string }[];
    pages?: ImageInfoPage[];
  };
};

export type CommonsFileInfo = {
  commonsFile: string;
  filePageUrl: string;
  originalUrl: string;
  width: number;
  height: number;
  mimeType: string;
  licenseShortName: string;
  licenseUrl: string | null;
  authorText: string;
  authorUrl: string | null;
  creditText: string | null;
  attributionRequired: boolean;
};

export class NotFreeError extends Error {}

const FREE_LICENSE =
  /^(cc0|cc[ -]by(-sa)?[ -]\d(\.\d)?([ -][a-z]{2,})?|cc[ -]by(-sa)?|public domain|pd\b.*|gfdl.*|attribution|no restrictions)/i;

/** Plain text from Commons' HTML snippets ("<a href=...>Name</a>" -> "Name"). */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstHref(html: string): string | null {
  const m = html.match(/href="([^"]+)"/);
  if (!m) return null;
  const href = m[1].startsWith("//") ? `https:${m[1]}` : m[1];
  return /^https:\/\//.test(href) ? href : null;
}

/** Validates an imageinfo response and extracts what we store. Throws NotFreeError for non-free files. */
export function parseImageInfo(res: ImageInfoResponse): CommonsFileInfo {
  return parseImagePage(res.query?.pages?.[0]);
}

/** Same as parseImageInfo, for one page of a batched imageinfo response. */
export function parseImagePage(page: ImageInfoPage | undefined): CommonsFileInfo {
  if (!page || page.missing || !page.imageinfo?.[0])
    throw new Error(`File not found on Commons: ${page?.title ?? "unknown"}`);
  const info = page.imageinfo[0];
  const meta = info.extmetadata ?? {};
  const v = (k: string) => meta[k]?.value?.trim() || null;

  const license = v("LicenseShortName") ?? "";
  if (v("NonFree") === "true" || !FREE_LICENSE.test(license)) {
    throw new NotFreeError(`${page.title} is not freely licensed (${license || "no license"})`);
  }
  const artistHtml = v("Artist") ?? "";
  return {
    commonsFile: page.title,
    filePageUrl: info.descriptionurl,
    originalUrl: info.url,
    width: info.width,
    height: info.height,
    mimeType: info.mime,
    licenseShortName: license,
    licenseUrl: v("LicenseUrl"),
    authorText: stripHtml(artistHtml) || "Unknown author",
    authorUrl: firstHref(artistHtml),
    creditText: v("Credit") ? stripHtml(v("Credit")!) : null,
    attributionRequired: v("AttributionRequired") !== "false",
  };
}

export async function fetchCommonsFile(title: string): Promise<CommonsFileInfo> {
  const url = new URL(COMMONS_API);
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    titles: title.startsWith("File:") ? title : `File:${title}`,
  }).toString();
  const res = await loggedFetch({ service: "commons", operation: "commons.imageinfo", meta: { file: title } }, url, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
  });
  return parseImageInfo((await res.json()) as ImageInfoResponse);
}
