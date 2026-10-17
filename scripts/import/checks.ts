/**
 * Checks on a person's Wikidata facts before they get a page. A person whose
 * dates can't be right is left out; gaps and disagreements become notes the
 * page shows, so nothing missing is hidden and nothing is made up to fill it.
 */
import { DATA_NOTES, type DataNote } from "@/lib/people/notes";
import type { LifeEvent } from "./model";
import { claims, timeOf, type Entity } from "./wikidata";

export { DATA_NOTES, type DataNote };

/** Nobody verified has lived longer than this. */
export const MAX_LIFESPAN = 122;
/** Born this many years ago with no death recorded: probably a gap, not a living person. */
const SURELY_DEAD_AFTER = 110;

/** Years from the best-ranked statements of a date property. */
function bestYears(e: Entity, prop: string): number[] {
  const all = claims(e, prop);
  const top = all.filter((c) => c.rank === all[0]?.rank);
  return [...new Set(top.flatMap((c) => timeOf(c.mainsnak)?.year ?? []))];
}

/** Why this person's dates can't be trusted, or null when they can. */
export function datesProblem(birthYear: number, deathYear: number | null, currentYear: number): string | null {
  if (birthYear > currentYear) return "born in the future";
  if ((deathYear ?? currentYear) - birthYear > MAX_LIFESPAN) return "lifespan too long";
  return null;
}

export function personNotes(
  e: Entity,
  p: {
    birthYear: number;
    deathYear: number | null;
    birthPlace: string | null;
    biography: string | null;
    life: LifeEvent[];
  },
  currentYear: number,
): DataNote[] {
  const notes: DataNote[] = [];
  if (bestYears(e, "P569").length > 1) notes.push("birth-date-disputed");
  if (p.deathYear == null && currentYear - p.birthYear > SURELY_DEAD_AFTER) notes.push("death-not-recorded");
  if (!p.birthPlace) notes.push("birthplace-not-recorded");
  if (!p.life.some((l) => l.kind !== "birth" && l.kind !== "death")) notes.push("few-dated-facts");
  if (!p.biography) notes.push("no-biography");
  return notes;
}
