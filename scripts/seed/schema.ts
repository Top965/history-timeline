import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const year = z
  .number()
  .int()
  .refine((y) => y !== 0, "there is no year 0");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const keywords = z.array(z.string().min(1)).default([]);

const eraTranslation = z.object({ name: z.string().min(1), keywords });
const eventTranslation = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  placeLabel: z.string().min(1),
  mediaHint: z.string().nullable(),
  keywords,
});
const topicTranslation = z.object({
  name: z.string().min(1),
  summary: z.string().min(1).optional(),
  keywords,
});

export const seedSchema = z
  .object({
    eras: z.array(
      z.object({
        slug,
        startYear: year,
        endYear: year.nullable(),
        colorToken: z.string().regex(/^--[a-z0-9-]+$/),
        sortOrder: z.number().int(),
        translations: z.object({ en: eraTranslation }).catchall(eraTranslation),
      }),
    ),
    events: z.array(
      z.object({
        slug,
        prototypeId: z.string(),
        startYear: year,
        endYear: year.nullable(),
        isApproximate: z.boolean(),
        importance: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        wikidataId: z
          .string()
          .regex(/^Q[1-9]\d*$/)
          .optional(),
        translations: z.object({ en: eventTranslation }).catchall(eventTranslation),
        /** English Wikipedia articles that back the text above. */
        sources: z
          .array(
            z.object({
              title: z.string().min(1),
              url: z.string().regex(/^https:\/\/en\.wikipedia\.org\/wiki\/\S+$/),
            }),
          )
          .default([]),
      }),
    ),
    topics: z.array(
      z.object({
        slug,
        startYear: year,
        endYear: year.nullable(),
        isApproximate: z.boolean(),
        isSensitive: z.boolean(),
        events: z.array(slug).min(1),
        translations: z.object({ en: topicTranslation.required({ summary: true }) }).catchall(topicTranslation),
      }),
    ),
    stories: z.array(
      z.object({
        event: slug,
        locale: z.string().regex(/^[a-z]{2,3}$/),
        layout: z.enum(["short", "full"]),
        dek: z.string().nullable(),
        footnote: z.string().nullable(),
        startDate: isoDate,
        endDate: isoDate.nullable(),
        heroHint: z.string(),
        stats: z.array(z.object({ value: z.string(), description: z.string() })),
        keyDates: z.array(z.object({ date: isoDate, label: z.string(), chapter: z.number().int().positive() })),
        chapters: z.array(
          z.object({
            title: z.string(),
            period: z.string(),
            paragraphs: z.array(z.string()).min(1),
            figure: z.object({ kind: z.enum(["photo", "map"]), caption: z.string() }),
            showsSides: z.boolean(),
          }),
        ),
        sides: z.array(
          z.object({
            name: z.string(),
            members: z.array(z.object({ name: z.string(), note: z.string().nullable() })),
          }),
        ),
        people: z.array(
          z.object({
            initials: z.string().min(1).max(3),
            name: z.string(),
            description: z.string(),
          }),
        ),
        related: z.array(slug),
      }),
    ),
  })
  .superRefine((data, ctx) => {
    const eventSlugs = new Set(data.events.map((e) => e.slug));
    if (eventSlugs.size !== data.events.length) {
      ctx.addIssue({ code: "custom", message: "duplicate event slug" });
    }
    for (const t of data.topics) {
      for (const s of t.events) {
        if (!eventSlugs.has(s)) ctx.addIssue({ code: "custom", message: `topic ${t.slug}: unknown event ${s}` });
      }
    }
    for (const s of data.stories) {
      if (!eventSlugs.has(s.event)) ctx.addIssue({ code: "custom", message: `story: unknown event ${s.event}` });
      for (const r of s.related) {
        if (!eventSlugs.has(r)) ctx.addIssue({ code: "custom", message: `story ${s.event}: unknown related ${r}` });
      }
      for (const d of s.keyDates) {
        if (d.chapter > s.chapters.length) {
          ctx.addIssue({
            code: "custom",
            message: `story ${s.event}: key date points at missing chapter ${d.chapter}`,
          });
        }
      }
    }
  });

export type SeedData = z.infer<typeof seedSchema>;
