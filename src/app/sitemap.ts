import type { MetadataRoute } from "next";
import { getPublishedEventSlugs, getPublishedPeopleSlugs, getPublishedTopicSlugs } from "@/lib/db/queries";
import { siteUrl } from "@/lib/env";
import { LOCALES } from "@/lib/i18n/config";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const abs = (path: string) => new URL(path, base).toString();
  const alternates = (path: string) => ({
    languages: Object.fromEntries(LOCALES.map((l) => [l, abs(`/${l}${path}`)])),
  });
  const [events, people, topics] = await Promise.all([
    getPublishedEventSlugs(),
    getPublishedPeopleSlugs(),
    getPublishedTopicSlugs(),
  ]);
  const pages = (kind: string, rows: { slug: string; updatedAt: string }[], locale: string, priority: number) =>
    rows.map((r) => ({
      url: abs(`/${locale}/${kind}/${r.slug}`),
      lastModified: r.updatedAt,
      changeFrequency: "weekly" as const,
      priority,
      alternates: alternates(`/${kind}/${r.slug}`),
    }));
  return LOCALES.flatMap((locale) => [
    { url: abs(`/${locale}`), changeFrequency: "daily" as const, priority: 1, alternates: alternates("") },
    ...events.map((e) => ({
      url: abs(`/${locale}/events/${e.slug}`),
      lastModified: e.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
      alternates: alternates(`/events/${e.slug}`),
    })),
    ...pages("topics", topics, locale, 0.8),
    ...pages("people", people, locale, 0.6),
  ]);
}
