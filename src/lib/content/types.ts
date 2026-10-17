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

/** A person as the timeline and search know them; the full page is PersonPage. */
export type PersonSummary = {
  slug: string;
  name: string;
  description: string | null;
  birthYear: number;
  deathYear: number | null;
  isApproximate: boolean;
  textLocale: Locale;
  keywords: string[];
};

/**
 * What a timeline page ships to the browser: the eras and the biggest events
 * (importance 1). Smaller events load by period as the visitor zooms in
 * (see `TimelineTile`), and search runs on the server over `SearchData`.
 */
export type TimelineData = {
  currentYear: number;
  eras: Era[];
  events: TimelineEvent[];
};

/** Everything search looks through. Built on the server only. */
export type SearchData = {
  currentYear: number;
  eras: Era[];
  events: TimelineEvent[];
  topics: Topic[];
  people: PersonSummary[];
};

/** Smaller events for one stretch of time, loaded as the visitor zooms in. */
export type TimelineTile = { level: 2 | 3; tile: number; events: TimelineEvent[] };

/** Where imported text comes from; shown as a credit next to it (CC BY-SA). */
export type TextSource = { url: string; title: string; license: string | null };

export type TopicLink = {
  slug: string;
  name: string;
  startYear: number;
  endYear: number | null;
  isApproximate: boolean;
};

export type PersonCard = {
  slug: string;
  name: string;
  description: string | null;
  birthYear: number;
  deathYear: number | null;
  isApproximate: boolean;
  textLocale: Locale;
  image: CommonsImage | null;
};

export type LifeEventKind = "birth" | "death" | "position" | "conflict" | "team" | "award" | "event";

export type LifeItem = {
  kind: LifeEventKind;
  startYear: number;
  endYear: number | null;
  startDate: string | null;
  endDate: string | null;
  isApproximate: boolean;
  label: string;
  labelLocale: Locale;
  /** Set when the item is also an event on the site. */
  eventSlug: string | null;
};

export type PersonPage = {
  person: PersonCard & {
    biography: string | null;
    birthDate: string | null;
    deathDate: string | null;
    birthPlace: string | null;
    deathPlace: string | null;
  };
  source: TextSource | null;
  life: LifeItem[];
  /** The biggest world events during their lifetime, shown faintly for context. */
  world: (EventLink & { importance: 1 | 2 | 3; textLocale: Locale })[];
  topics: TopicLink[];
};

export type TopicEventItem = EventLink & {
  summary: string;
  place: string;
  importance: 1 | 2 | 3;
  textLocale: Locale;
  hasFullStory: boolean;
};

export type TopicPage = {
  topic: Topic & { isSensitive: boolean };
  source: TextSource | null;
  events: TopicEventItem[];
  people: PersonCard[];
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
  /** Wikipedia article the summary is drawn from (imported events only). */
  source: TextSource | null;
  topics: TopicLink[];
  people: PersonCard[];
  story: Story | null;
  previous: EventLink | null;
  next: EventLink | null;
};
