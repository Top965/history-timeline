import type { Locale } from "@/lib/i18n/config";

/** Shapes the website renders. Produced by src/lib/db/queries.ts, serializable for client components. */

export type Era = {
  slug: string;
  name: string;
  startYear: number;
  endYear: number | null;
  colorToken: string;
  keywords: string[];
};

export type TimelineEvent = {
  slug: string;
  title: string;
  place: string;
  startYear: number;
  endYear: number | null;
  isApproximate: boolean;
  importance: 1 | 2 | 3;
  hasFullStory: boolean;
  /** Locale the title/place are written in (may be the fallback locale). */
  textLocale: Locale;
  keywords: string[];
};

export type Topic = {
  slug: string;
  name: string;
  summary: string;
  summaryLocale: Locale;
  startYear: number;
  endYear: number | null;
  isApproximate: boolean;
  eventSlugs: string[];
  keywords: string[];
};

export type TimelineData = {
  currentYear: number;
  eras: Era[];
  events: TimelineEvent[];
  topics: Topic[];
};

export type CommonsImage = {
  commonsFile: string;
  filePageUrl: string;
  originalUrl: string;
  width: number;
  height: number;
  mimeType: string;
  license: string;
  licenseUrl: string | null;
  author: string;
  authorUrl: string | null;
  caption: string;
  alt: string;
};

export type EventLink = {
  slug: string;
  title: string;
  startYear: number;
  endYear: number | null;
  isApproximate: boolean;
};

export type StoryChapter = {
  order: number;
  title: string;
  period: string;
  paragraphs: string[];
  figure: { kind: "photo" | "map"; caption: string; image: CommonsImage | null } | null;
  showsSides: boolean;
};

export type Story = {
  locale: Locale;
  layout: "short" | "full";
  dek: string | null;
  footnote: string | null;
  stats: { value: string; description: string }[];
  keyDates: { date: string; label: string; chapter: number | null }[];
  chapters: StoryChapter[];
  sides: { name: string; members: { name: string; note: string | null }[] }[];
  people: { name: string; description: string; initials: string; image: CommonsImage | null }[];
  related: EventLink[];
};

export type EventPage = {
  event: EventLink & {
    summary: string;
    place: string;
    startDate: string | null;
    endDate: string | null;
    importance: 1 | 2 | 3;
    mediaHint: string | null;
    textLocale: Locale;
  };
  era: { slug: string; name: string } | null;
  hero: CommonsImage | null;
  story: Story | null;
  previous: EventLink | null;
  next: EventLink | null;
};
