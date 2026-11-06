import { seedOccasions } from "../data/occasions";

/** The "no filter" entry, always first in the occasion filter row. */
export const ALL_OCCASIONS = "All";

interface LookLike {
  name: string;
  occasion: string;
}

/** Filter row entries: "All", the seed occasions, then any other distinct
 *  occasions present on the looks (first-seen order; empty ones skipped). */
export function occasionFilters(looks: { occasion: string }[]): string[] {
  const extra = Array.from(
    new Set(looks.map((look) => look.occasion).filter((occasion) => Boolean(occasion) && !seedOccasions.includes(occasion))),
  );
  return [ALL_OCCASIONS, ...seedOccasions, ...extra];
}

/** Looks matching the active occasion ("All" keeps every look). */
export function filterLooks<T extends { occasion: string }>(looks: T[], occasion: string): T[] {
  if (occasion === ALL_OCCASIONS) return looks;
  return looks.filter((look) => look.occasion === occasion);
}

/** "0 looks" / "1 look" / "N looks". */
export function lookCountLabel(count: number): string {
  return `${count} ${count === 1 ? "look" : "looks"}`;
}

/** A list tile's accessible name: "<name>, <occasion>", or just the name. */
export function lookTileLabel(look: LookLike): string {
  const occasion = look.occasion.trim();
  return occasion ? `${look.name}, ${occasion}` : look.name;
}
