import { describe, expect, it } from "vitest";
import { buildSearchIndex, parseYear, search } from "@/lib/search/search";
import { editDistance, normalize, words, wordScore } from "@/lib/search/text";
import { seedTimelineData } from "../support/fixtures";

const index = buildSearchIndex(seedTimelineData());
const top = (q: string) => {
  const [r] = search(index, q);
  if (!r) return null;
  return r.type === "year"
    ? `year:${r.year}`
    : r.type === "era"
      ? `era:${r.era.slug}`
      : r.type === "topic"
        ? `topic:${r.topic.slug}`
        : `event:${r.event.slug}`;
};

describe("search: the examples from the brief", () => {
  it.each([
    ["egypt pyramids", "topic:ancient-egypt"],
    ["palestine israel war", "topic:israeli-palestinian-conflict"],
    ["world cup", "topic:fifa-world-cup"],
    ["44 BC", "year:-44"],
    ["Ottoman Empire", "topic:ottoman-empire"],
    ["cold war", "topic:cold-war"],
    ["history of kuwait", "topic:history-of-kuwait"],
  ])("%s -> %s", (q, expected) => {
    expect(top(q)).toBe(expected);
  });
});

describe("search: typos, eras, events", () => {
  it.each([
    ["otoman", "topic:ottoman-empire"],
    ["mesopotamya", "topic:mesopotamia"],
    ["middle ages", "era:medieval"],
    ["moon landing", "event:apollo-11-moon-landing"],
    ["berlin wall", "event:fall-of-the-berlin-wall"],
    ["maradona", "event:maradonas-world-cup"],
    ["1969", "year:1969"],
  ])("%s -> %s", (q, expected) => {
    expect(top(q)).toBe(expected);
  });

  it("lists a topic's events after the topic", () => {
    const results = search(index, "world cup");
    expect(results.slice(1).every((r) => r.type === "event")).toBe(true);
    expect(results.length).toBeGreaterThan(3);
  });

  it("finds topics and eras by their Arabic names, with or without the article", () => {
    expect(top("الدولة العثمانية")).toBe("topic:ottoman-empire");
    expect(top("عثمانية")).toBe("topic:ottoman-empire");
    expect(top("كأس العالم")).toBe("topic:fifa-world-cup");
    expect(top("تاريخ الكويت")).toBe("topic:history-of-kuwait");
    expect(top("العصور الوسطى")).toBe("era:medieval");
  });

  it("returns nothing for empty or unknown queries and ignores years outside the timeline", () => {
    expect(search(index, "   ")).toEqual([]);
    expect(search(index, "zzzzqqq")).toEqual([]);
    expect(search(index, "2999")).toEqual([]);
  });

  it("caps results at the limit", () => {
    expect(search(index, "war", 3)).toHaveLength(3);
  });
});

describe("parseYear", () => {
  it.each([
    ["44 BC", -44],
    ["44 bce", -44],
    ["44 B.C.", -44],
    ["-44", -44],
    ["1066", 1066],
    ["AD 800", 800],
    ["800 ce", 800],
    ["44 ق.م", -44],
    ["44 ق م", -44],
    ["١٩٦٩", 1969],
    ["622 م", 622],
  ])("%s -> %d", (q, y) => {
    expect(parseYear(q)).toBe(y);
  });
  it("rejects non-years and year 0", () => {
    expect(parseYear("0")).toBeNull();
    expect(parseYear("world cup")).toBeNull();
    expect(parseYear("12345")).toBeNull();
  });
});

describe("text normalization", () => {
  it("folds case, accents and punctuation", () => {
    expect(normalize("Gutenberg’s Printing-Press")).toBe("gutenbergs printing press");
    expect(normalize("Temüjin")).toBe("temujin");
  });
  it("normalizes Arabic letters, diacritics and digits", () => {
    expect(normalize("مُحَمَّد")).toBe("محمد");
    expect(normalize("أهرامات الجيزة")).toBe("اهرامات الجيزه");
    expect(normalize("١٩٤٨")).toBe("1948");
    expect(words("والكويت")).toEqual(["كويت"]);
    expect(words("الحرب")).toEqual(["حرب"]);
  });
  it("scores exact, prefix and near-miss words", () => {
    expect(wordScore("egypt", "egypt")).toBe(3);
    expect(wordScore("egy", "egyptian")).toBe(2);
    expect(wordScore("otoman", "ottoman")).toBe(1.5);
    expect(wordScore("cat", "car")).toBe(0);
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("a", "abcdef")).toBe(9);
  });
});
