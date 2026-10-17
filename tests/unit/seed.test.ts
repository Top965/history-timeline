import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSeedSql } from "../../scripts/seed/build-seed";
import { seedSchema } from "../../scripts/seed/schema";

const root = resolve(import.meta.dirname, "../..");
const content = JSON.parse(readFileSync(resolve(root, "supabase/seed-data/content.json"), "utf8"));

describe("seed content", () => {
  const data = seedSchema.parse(content);

  it("contains everything from the prototype", () => {
    expect(data.eras).toHaveLength(6);
    expect(data.events).toHaveLength(64);
    expect(data.topics.map((t) => t.translations.en.name)).toEqual(
      expect.arrayContaining([
        "Ancient Egypt",
        "Mesopotamia",
        "Ancient Greece",
        "Ancient Rome",
        "Islamic Golden Age",
        "Mongol Empire",
        "Ottoman Empire",
        "Cold War",
        "Israeli–Palestinian conflict",
        "FIFA World Cup",
        "History of Kuwait",
      ]),
    );
    const ww1 = data.stories.find((s) => s.event === "world-war-i")!;
    expect(ww1.chapters).toHaveLength(7);
    expect(ww1.keyDates).toHaveLength(8);
    expect(ww1.sides.map((s) => s.name)).toEqual(["Allies", "Central Powers"]);
    expect(ww1.people).toHaveLength(7);
  });

  it("gives every era and topic an Arabic name", () => {
    expect(data.eras.every((e) => e.translations.ar?.name)).toBe(true);
    expect(data.topics.every((t) => t.translations.ar?.name)).toBe(true);
  });

  it("rejects broken references", () => {
    const broken = structuredClone(content);
    broken.topics[0].events.push("no-such-event");
    expect(() => seedSchema.parse(broken)).toThrow(/unknown event no-such-event/);
  });

  it("matches the committed seed.sql", () => {
    expect(buildSeedSql(data)).toBe(readFileSync(resolve(root, "supabase/seed.sql"), "utf8"));
  });

  it("escapes quotes in text", () => {
    const withQuote = structuredClone(content);
    withQuote.events[0].translations.en.title = "Hammurabi's code";
    expect(buildSeedSql(seedSchema.parse(withQuote))).toContain("'Hammurabi''s code'");
  });
});
