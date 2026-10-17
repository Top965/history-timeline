/** Gaps and disagreements the importer can find in a person's data; each is shown on their page. */
export const DATA_NOTES = [
  /** Wikidata's best statements give different birth years. */
  "birth-date-disputed",
  /** Born long ago, but no death is recorded. */
  "death-not-recorded",
  "birthplace-not-recorded",
  /** Nothing dated besides birth and death. */
  "few-dated-facts",
  /** No Wikipedia text in English to show. */
  "no-biography",
] as const;
export type DataNote = (typeof DATA_NOTES)[number];

export const isDataNote = (s: string): s is DataNote => (DATA_NOTES as readonly string[]).includes(s);
