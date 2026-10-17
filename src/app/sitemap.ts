import type { MetadataRoute } from "next";
import { getPublishedEventSlugs } from "@/lib/db/queries";
import { siteUrl } from "@/lib/env";
import { LOCALES } from "@/lib/i18n/config";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const abs = (path: string) => new URL(path, base).toString();
  const alternates = (path: string) => ({
    languages: Object.fromEntries(LOCALES.map((l) => [l, abs(`/${l}${path}`)])),
  });
  const events = await getPublishedEventSlugs();
  return LOCALES.flatMap((locale) => [
    { url: abs(`/${locale}`), changeFrequency: "daily" as const, priority: 1, alternates: alternates("") },
    ...events.map((e) => ({
      url: abs(`/${locale}/events/${e.slug}`),
      lastModified: e.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
      alternates: alternates(`/events/${e.slug}`),
    })),
  ]);
}
