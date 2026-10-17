import { describe, expect, it } from "vitest";
import { datesProblem, personNotes } from "../../scripts/import/checks";
import type { Entity } from "../../scripts/import/wikidata";

const birth = (time: string, rank: "normal" | "preferred" = "normal") => ({
  rank,
  mainsnak: {
    snaktype: "value" as const,
    property: "P569",
    datavalue: { type: "time", value: { time, precision: 9 } },
  },
});
const base = { birthYear: 1950, deathYear: null, birthPlace: "Baghdad", biography: "Text.", life: [] };
const dated = [{ kind: "position" } as never];

describe("person data checks", () => {
  it("refuses dates that can't be right", () => {
    expect(datesProblem(2030, null, 2026)).toBe("born in the future");
    expect(datesProblem(1700, null, 2026)).toBe("lifespan too long");
    expect(datesProblem(1500, 1650, 2026)).toBe("lifespan too long");
    expect(datesProblem(1500, 1580, 2026)).toBeNull();
    expect(datesProblem(1930, null, 2026)).toBeNull();
  });

  it("notes what is missing instead of filling it in", () => {
    const e: Entity = { id: "Q1", claims: { P569: [birth("+1950-01-01T00:00:00Z")] } };
    expect(personNotes(e, { ...base, life: dated }, 2026)).toEqual([]);
    expect(personNotes(e, { ...base, birthYear: 1850, birthPlace: null, biography: null }, 2026)).toEqual([
      "death-not-recorded",
      "birthplace-not-recorded",
      "few-dated-facts",
      "no-biography",
    ]);
  });

  it("flags disagreeing birth years among the best statements only", () => {
    const disputed: Entity = {
      id: "Q1",
      claims: { P569: [birth("+1950-01-01T00:00:00Z"), birth("+1952-01-01T00:00:00Z")] },
    };
    const settled: Entity = {
      id: "Q1",
      claims: { P569: [birth("+1950-01-01T00:00:00Z", "preferred"), birth("+1952-01-01T00:00:00Z")] },
    };
    expect(personNotes(disputed, { ...base, life: dated }, 2026)).toEqual(["birth-date-disputed"]);
    expect(personNotes(settled, { ...base, life: dated }, 2026)).toEqual([]);
  });
});
