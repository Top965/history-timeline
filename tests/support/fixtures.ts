import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SearchData } from "@/lib/content/types";
import { seedSchema } from "../../scripts/seed/schema";

/** The seeded content as the website sees it, built without a database (mirrors src/lib/db/queries.ts). */
export function seedTimelineData(currentYear = 2026): SearchData {
  const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../supabase/seed-data/content.json"), "utf8"));
  const seed = seedSchema.parse(raw);
  const all = <T extends { keywords: string[] }>(tr: Record<string, T>, extra: (t: T) => string[]) => [
    ...new Set(Object.values(tr).flatMap((t) => [...t.keywords, ...extra(t)])),
  ];
  const fullStories = new Set(seed.stories.filter((s) => s.layout === "full").map((s) => s.event));
  return {
    currentYear,
    // People come from the importer, not the seed; tests that need them add their own.
    people: [],
    eras: seed.eras.map((e) => ({
      slug: e.slug,
      name: e.translations.en.name,
      startYear: e.startYear,
      endYear: e.endYear,
      colorToken: e.colorToken,
      keywords: all(e.translations, (t) => [t.name]),
    })),
    events: seed.events.map((e) => ({
      slug: e.slug,
      title: e.translations.en.title,
      place: e.translations.en.placeLabel,
      startYear: e.startYear,
      endYear: e.endYear,
      isApproximate: e.isApproximate,
      importance: e.importance,
      hasFullStory: fullStories.has(e.slug),
      textLocale: "en",
      keywords: all(e.translations, () => []),
    })),
    topics: seed.topics.map((t) => ({
      slug: t.slug,
      kind: "topic" as const,
      name: t.translations.en.name,
      summary: t.translations.en.summary!,
      summaryLocale: "en",
      startYear: t.startYear,
      endYear: t.endYear,
      isApproximate: t.isApproximate,
      eventSlugs: t.events,
      keywords: all(t.translations, (tr) => [tr.name]),
    })),
  };
}
