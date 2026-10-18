/**
 * Something on Wikidata found by "look up on Wikipedia": a person who can be
 * added to the site, an event already on it, or any other article to read.
 */
export type Candidate = {
  wikidataId: string;
  name: string;
  description: string | null;
  kind: "person" | "event" | "article";
  /** For an event already on the site, its page. */
  slug?: string;
};
