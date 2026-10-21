import type { OrganizingItem } from "../types";

export type SortOrder = "newest" | "oldest";

export const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];

function timeOf(item: OrganizingItem): number {
  const t = item.createdAt ? Date.parse(item.createdAt) : NaN;
  // Missing/invalid dates sort as the oldest possible.
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

function idOf(item: OrganizingItem): number {
  const n = Number(item.id);
  return Number.isNaN(n) ? 0 : n;
}

/** Ascending (oldest first): createdAt asc, then numeric id asc. */
function compareOldest(a: OrganizingItem, b: OrganizingItem): number {
  const ta = timeOf(a);
  const tb = timeOf(b);
  if (ta !== tb) return ta < tb ? -1 : 1;
  return idOf(a) - idOf(b);
}

/** Returns a new sorted array; never mutates the input. */
export function sortItems(items: OrganizingItem[], order: SortOrder): OrganizingItem[] {
  const sorted = [...items].sort(compareOldest);
  return order === "newest" ? sorted.reverse() : sorted;
}
