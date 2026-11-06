import { seedOccasions } from "../data/occasions";

/** The "no filter" entry, always first in the occasion filter row. */
export const ALL_OCCASIONS = "All";

interface LookLike {
  name: string;
  occasion: string;
}

/** A look's occasion with surrounding whitespace removed ("" = none). */
const occasionOf = (look: { occasion: string }) => look.occasion.trim();

/** Filter row entries: "All", the seed occasions, then any other distinct
 *  occasions present on the looks (trimmed, first-seen order; blank ones
 *  skipped). */
export function occasionFilters(looks: { occasion: string }[]): string[] {
  const extra = Array.from(
    new Set(looks.map(occasionOf).filter((occasion) => Boolean(occasion) && !seedOccasions.includes(occasion))),
  );
  return [ALL_OCCASIONS, ...seedOccasions, ...extra];
}

/** Looks matching the active occasion, compared trimmed ("All" keeps every look). */
export function filterLooks<T extends { occasion: string }>(looks: T[], occasion: string): T[] {
  if (occasion === ALL_OCCASIONS) return looks;
  const wanted = occasion.trim();
  return looks.filter((look) => occasionOf(look) === wanted);
}

/** "0 looks" / "1 look" / "N looks". */
export function lookCountLabel(count: number): string {
  return `${count} ${count === 1 ? "look" : "looks"}`;
}

/** A list tile's accessible name: "<name>, <occasion>", or just the name. */
export function lookTileLabel(look: LookLike): string {
  const occasion = occasionOf(look);
  return occasion ? `${look.name}, ${occasion}` : look.name;
}
