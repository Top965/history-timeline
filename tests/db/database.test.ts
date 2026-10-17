/**
 * Runs against a real Postgres prepared by `npm run db:reset` (shim + migrations + seed).
 * Skipped when DATABASE_URL is not set.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));

const url = process.env.DATABASE_URL;
const sql = url ? postgres(url, { max: 2, onnotice: () => {} }) : null;

/** Runs `fn` in a transaction that is always rolled back. */
async function rolledBack(fn: (tx: postgres.TransactionSql) => Promise<void>) {
  await sql!
    .begin(async (tx) => {
      await fn(tx);
      throw new Error("__rollback__");
    })
    .catch((e: Error) => {
      if (e.message !== "__rollback__") throw e;
    });
}

describe.skipIf(!url)("database", () => {
  afterAll(async () => {
    await sql?.end();
  });

  describe("seed", () => {
    it("loads the prototype content", async () => {
      const [c] = await sql!`
        select (select count(*)::int from events) as events, (select count(*)::int from topics) as topics,
               (select count(*)::int from eras) as eras, (select count(*)::int from story_chapters) as chapters`;
      expect(c).toEqual({ events: 64, topics: 11, eras: 6, chapters: 14 });
    });

    it("is idempotent", async () => {
      const { readFileSync } = await import("node:fs");
      const seed = readFileSync(new URL("../../supabase/seed.sql", import.meta.url), "utf8");
      // The file wraps itself in begin/commit for psql; run its body in one transaction here.
      await sql!.begin((tx) => tx.unsafe(seed.replace(/^(begin|commit);$/gm, "")));
      const [c] = await sql!`select count(*)::int as n from events`;
      expect(c.n).toBe(64);
    });
  });

  describe("constraints", () => {
    it("rejects year 0, reversed ranges and bad importance", async () => {
      await expect(
        rolledBack((tx) => tx`insert into events (slug, start_year, importance) values ('y0', 0, 1)`.then()),
      ).rejects.toThrow();
      await expect(
        rolledBack((tx) =>
          tx`insert into events (slug, start_year, end_year, importance) values ('rev', 1918, 1914, 1)`.then(),
        ),
      ).rejects.toThrow();
      await expect(
        rolledBack((tx) => tx`insert into events (slug, start_year, importance) values ('imp', 1900, 4)`.then()),
      ).rejects.toThrow();
    });

    it("refuses non-free images and non-Commons URLs", async () => {
      const base = {
        commons_file: "File:X.jpg",
        file_page_url: "https://commons.wikimedia.org/wiki/File:X.jpg",
        original_url: "https://upload.wikimedia.org/wikipedia/commons/x/xx/X.jpg",
        width: 10,
        height: 10,
        mime_type: "image/jpeg",
        license_short_name: "CC BY-SA 4.0",
        author_text: "Someone",
        attribution_required: true,
        is_free: true,
      };
      await expect(
        rolledBack((tx) => tx`insert into images ${tx({ ...base, is_free: false })}`.then()),
      ).rejects.toThrow();
      await expect(
        rolledBack((tx) => tx`insert into images ${tx({ ...base, original_url: "https://example.com/x.jpg" })}`.then()),
      ).rejects.toThrow();
      await rolledBack(async (tx) => {
        await tx`insert into images ${tx(base)}`;
      });
    });

    it("requires date, place and source on contributions", async () => {
      await rolledBack(async (tx) => {
        const [u] = await tx`insert into auth.users (email) values ('c@example.com') returning id`;
        await tx`insert into profiles (id) values (${u.id})`;
        await expect(
          tx.savepoint(
            (
              sp,
            ) => sp`insert into contributions (profile_id, kind, locale, title, body, start_year, place_label, source_description)
            values (${u.id}, 'new_event', 'en', 'Title', 'A long enough body', 1990, '', 'Book')`,
          ),
        ).rejects.toThrow();
      });
    });
  });

  describe("row level security (as the public `anon` role)", () => {
    it("hides drafts and everything that hangs off them", async () => {
      await rolledBack(async (tx) => {
        const [draft] =
          await tx`insert into events (slug, start_year, importance, status) values ('secret-draft', 1950, 1, 'draft') returning id`;
        await tx`insert into event_translations (event_id, locale, title, summary, place_label) values (${draft.id}, 'en', 'Secret', 'Hidden', 'Nowhere')`;
        await tx`set local role anon`;
        const events = await tx`select slug from events where slug = 'secret-draft'`;
        const texts = await tx`select title from event_translations where title = 'Secret'`;
        const visible = await tx`select count(*)::int as n from events`;
        expect(events).toHaveLength(0);
        expect(texts).toHaveLength(0);
        expect(visible[0].n).toBe(64);
      });
    });

    it("hides unpublished stories", async () => {
      await rolledBack(async (tx) => {
        await tx`update stories set status = 'in_review'`;
        await tx`set local role anon`;
        expect(await tx`select id from stories`).toHaveLength(0);
        expect(await tx`select title from story_chapters`).toHaveLength(0);
      });
    });

    it("blocks writes and private tables", async () => {
      await rolledBack(async (tx) => {
        await tx`set local role anon`;
        await expect(
          tx.savepoint((sp) => sp`insert into events (slug, start_year, importance) values ('x', 1, 1)`),
        ).rejects.toThrow(/permission denied/);
        await expect(tx.savepoint((sp) => sp`select * from profiles`)).rejects.toThrow(/permission denied/);
        await expect(tx.savepoint((sp) => sp`select * from contributions`)).rejects.toThrow(/permission denied/);
      });
    });

    it("lets signed-in users see and submit only their own contributions, unreviewed", async () => {
      await rolledBack(async (tx) => {
        const [a] = await tx`insert into auth.users (email) values ('a@example.com') returning id`;
        const [b] = await tx`insert into auth.users (email) values ('b@example.com') returning id`;
        await tx`insert into profiles (id) values (${a.id}), (${b.id})`;
        await tx`insert into contributions (profile_id, kind, locale, title, body, start_year, place_label, source_description)
          values (${b.id}, 'story', 'en', 'B story', 'Something from B here', 1990, 'Kuwait', 'Family')`;
        await tx`set local role authenticated`;
        await tx`select set_config('request.jwt.claim.sub', ${a.id}, true)`;
        expect(await tx`select title from contributions`).toHaveLength(0);
        await tx`insert into contributions (profile_id, kind, locale, title, body, start_year, place_label, source_description, is_personal_account)
          values (${a.id}, 'story', 'en', 'Grandfather', 'My grandfather sailed on a dhow', 1950, 'Kuwait', 'Family story', true)`;
        expect((await tx`select title from contributions`).map((r) => r.title)).toEqual(["Grandfather"]);
        await expect(
          tx.savepoint(
            (
              sp,
            ) => sp`insert into contributions (profile_id, kind, locale, title, body, start_year, place_label, source_description, status)
            values (${a.id}, 'story', 'en', 'Sneaky', 'Trying to self-approve', 1950, 'Kuwait', 'None', 'approved')`,
          ),
        ).rejects.toThrow(/row-level security/);
        await expect(tx.savepoint((sp) => sp`update profiles set role = 'admin' where id = ${a.id}`)).rejects.toThrow(
          /permission denied/,
        );
      });
    });
  });

  describe("website queries", () => {
    let queries: typeof import("@/lib/db/queries");
    beforeAll(async () => {
      queries = await import("@/lib/db/queries");
    });

    it("loads the timeline in Arabic", async () => {
      const en = await queries.getTimelineData("en");
      const ar = await queries.getTimelineData("ar");
      expect(en.events).toHaveLength(64);
      expect(en.events[0].slug).toBe("writing-begins-in-sumer");
      expect(en.eras.map((e) => e.name)).toEqual([
        "Ancient",
        "Classical",
        "Medieval",
        "Early Modern",
        "Modern",
        "Contemporary",
      ]);
      expect(ar.eras[0].name).toBe("العصور القديمة");
      const ipAr = ar.topics.find((t) => t.slug === "israeli-palestinian-conflict")!;
      expect(ipAr.name).toBe("الصراع الإسرائيلي الفلسطيني");
      expect(ipAr.summaryLocale).toBe("ar");
      expect(ar.events.every((e) => e.textLocale === "ar")).toBe(true);
      expect(ar.events.find((e) => e.slug === "the-hijra")?.title).toBe("الهجرة النبوية");
      expect(en.events.find((e) => e.slug === "world-war-i")?.hasFullStory).toBe(true);
      const wc = en.topics.find((t) => t.slug === "fifa-world-cup")!;
      expect(wc.eventSlugs[0]).toBe("first-fifa-world-cup");
      expect(wc.endYear).toBeNull();
      expect(wc.keywords).toEqual(expect.arrayContaining(["football", "كأس العالم"]));
    });

    it("loads the full World War I story", async () => {
      const page = (await queries.getEventPage("en", "world-war-i"))!;
      expect(page.event.startDate).toBe("1914-07-28");
      expect(page.event.endDate).toBe("1918-11-11");
      expect(page.era?.slug).toBe("modern");
      const story = page.story!;
      expect(story.layout).toBe("full");
      expect(story.chapters.map((c) => c.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(story.chapters[1].showsSides).toBe(true);
      expect(story.keyDates[0]).toEqual({ date: "1914-06-28", label: "Archduke shot in Sarajevo", chapter: 1 });
      expect(story.sides[0].members).toContainEqual({ name: "United States", note: "from 1917" });
      expect(story.people[0]).toMatchObject({ name: "Franz Ferdinand", initials: "FF", image: null });
      expect(story.related.map((r) => r.slug)).toEqual([
        "russian-revolution",
        "ottoman-empire-ends",
        "wall-street-crash",
        "world-war-ii",
      ]);
    });

    it("loads the Arabic World War I story", async () => {
      const page = (await queries.getEventPage("ar", "world-war-i"))!;
      const story = page.story!;
      expect(story.locale).toBe("ar");
      expect(story.chapters.map((c) => c.title)[0]).toBe("الشرارة");
      expect(story.keyDates[0]).toEqual({ date: "1914-06-28", label: "اغتيال الأرشيدوق في سراييفو", chapter: 1 });
      expect(story.sides[0].members).toContainEqual({ name: "الولايات المتحدة", note: "من 1917" });
      expect(story.related.map((r) => r.slug)).toContain("world-war-ii");
    });

    it("loads short events with neighbours and returns null for unknown slugs", async () => {
      const page = (await queries.getEventPage("ar", "great-pyramid-of-giza"))!;
      expect(page.story).toBeNull();
      expect(page.event.textLocale).toBe("ar");
      expect(page.event.title).toBe("الهرم الأكبر في الجيزة");
      expect(page.era?.name).toBe("العصور القديمة");
      expect(page.previous?.slug).toBe("upper-and-lower-egypt-unite");
      expect(page.next?.slug).toBe("code-of-hammurabi");
      expect(await queries.getEventPage("en", "does-not-exist")).toBeNull();
    });

    it("returns a hero image with its credit", async () => {
      const [image] = await sql!`
        insert into images (commons_file, file_page_url, original_url, width, height, mime_type,
          license_short_name, license_url, author_text, attribution_required, is_free)
        values ('File:Test pyramid.jpg', 'https://commons.wikimedia.org/wiki/File:Test_pyramid.jpg',
          'https://upload.wikimedia.org/wikipedia/commons/a/ab/Test_pyramid.jpg', 2000, 1500, 'image/jpeg',
          'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0', 'Test Author', true, true)
        returning id`;
      try {
        await sql!`insert into image_translations (image_id, locale, caption, alt_text) values (${image.id}, 'en', 'Pyramid at dusk', 'The pyramid')`;
        await sql!`insert into event_images (event_id, image_id, role)
          values ((select id from events where slug = 'great-pyramid-of-giza'), ${image.id}, 'hero')`;
        const page = (await queries.getEventPage("ar", "great-pyramid-of-giza"))!;
        expect(page.hero).toMatchObject({
          commonsFile: "File:Test pyramid.jpg",
          license: "CC BY-SA 4.0",
          author: "Test Author",
          caption: "Pyramid at dusk",
          alt: "The pyramid",
          width: 2000,
        });
      } finally {
        await sql!`delete from event_images where image_id = ${image.id}`;
        await sql!`delete from images where id = ${image.id}`;
      }
    });

    it("lists published slugs for the sitemap", async () => {
      const slugs = await queries.getPublishedEventSlugs();
      expect(slugs).toHaveLength(64);
      expect(slugs[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
