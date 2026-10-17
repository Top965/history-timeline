/**
 * The import bundle: everything one importer run produced, normalized and ready
 * to load. It is plain JSON so a run can be saved, reviewed and loaded later.
 */
import { z } from "zod";
import { DATA_NOTES } from "./checks";

const year = z
  .number()
  .int()
  .refine((y) => y !== 0 && y >= -100000 && y <= 3000, "historical year");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const qid = z.string().regex(/^Q[1-9]\d*$/);
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export const SourceSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  revisionId: z.number().int().nullable(),
});

export const ImageSchema = z.object({
  commonsFile: z.string().startsWith("File:"),
  filePageUrl: z.string().startsWith("https://commons.wikimedia.org/"),
  originalUrl: z.string().startsWith("https://upload.wikimedia.org/"),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mimeType: z.string().startsWith("image/"),
  licenseShortName: z.string().min(1),
  licenseUrl: z.string().nullable(),
  authorText: z.string().min(1),
  authorUrl: z.string().nullable(),
  creditText: z.string().nullable(),
  attributionRequired: z.boolean(),
});

const span = {
  startYear: year,
  endYear: year.nullable(),
  startDate: isoDate.nullable(),
  endDate: isoDate.nullable(),
  isApproximate: z.boolean(),
};

export const EventTextSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(2000),
  placeLabel: z.string().min(1).max(200),
  keywords: z.array(z.string()),
  source: SourceSchema.nullable(),
});

export const EventSchema = z.object({
  wikidataId: qid,
  slug,
  /** Set when this is one of the hand-written seed events: only its photo and links are updated. */
  seedSlug: slug.nullable(),
  ...span,
  importance: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  sitelinks: z.number().int().nonnegative(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  image: z.string().nullable(),
  text: z.object({ en: EventTextSchema, ar: EventTextSchema.nullable() }),
});

export const PersonTextSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(300).nullable(),
  biography: z.string().min(1).max(6000).nullable(),
  birthPlace: z.string().nullable(),
  deathPlace: z.string().nullable(),
  keywords: z.array(z.string()),
  source: SourceSchema.nullable(),
});

export const LifeEventSchema = z.object({
  kind: z.enum(["birth", "death", "position", "conflict", "team", "award", "event"]),
  ...span,
  /** The office, war, team, award or event. */
  wikidataId: qid.nullable(),
  label: z.object({ en: z.string().min(1).max(300), ar: z.string().min(1).max(300).nullable() }),
});

export const PersonSchema = z.object({
  wikidataId: qid,
  slug,
  birthYear: year,
  deathYear: year.nullable(),
  birthDate: isoDate.nullable(),
  deathDate: isoDate.nullable(),
  isApproximate: z.boolean(),
  sitelinks: z.number().int().nonnegative(),
  image: z.string().nullable(),
  text: z.object({ en: PersonTextSchema, ar: PersonTextSchema.nullable() }),
  life: z.array(LifeEventSchema),
  /** Gaps and disagreements in the data, shown on the page (older bundles have none). */
  notes: z.array(z.enum(DATA_NOTES)).default([]),
});

export const TopicTextSchema = z.object({
  name: z.string().min(1).max(120),
  summary: z.string().min(1).max(2000).nullable(),
  keywords: z.array(z.string()),
  source: SourceSchema.nullable(),
});

export const TopicSchema = z.object({
  slug,
  wikidataId: qid,
  isSensitive: z.boolean(),
  startYear: year,
  endYear: year.nullable(),
  isApproximate: z.boolean(),
  text: z.object({ en: TopicTextSchema, ar: TopicTextSchema.nullable() }),
  /** Wikidata ids of events, in timeline order. */
  events: z.array(qid),
  /** Wikidata ids of people, most covered first. */
  people: z.array(qid),
});

export const BundleSchema = z.object({
  generatedAt: z.string(),
  images: z.array(ImageSchema),
  events: z.array(EventSchema),
  people: z.array(PersonSchema),
  topics: z.array(TopicSchema),
  /** Hand-written seed events matched to Wikidata. */
  seedLinks: z.array(z.object({ slug, wikidataId: qid })),
});

export type Locale = "en" | "ar";
export type ImportSource = z.infer<typeof SourceSchema>;
export type ImportImage = z.infer<typeof ImageSchema>;
export type ImportEvent = z.infer<typeof EventSchema>;
export type ImportPerson = z.infer<typeof PersonSchema>;
export type LifeEvent = z.infer<typeof LifeEventSchema>;
export type ImportTopic = z.infer<typeof TopicSchema>;
export type Bundle = z.infer<typeof BundleSchema>;
