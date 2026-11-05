import type { Category, OrganizingItem } from "../types";
import type { PickerFilter } from "./pickerFilter";
import type { StylebookGroup } from "./placement";

/** The four Stylebook groups, always shown in this order. */
export const STYLEBOOK_GROUPS: { id: StylebookGroup; label: string }[] = [
  { id: "clothes", label: "Clothes" },
  { id: "shoes", label: "Shoes" },
  { id: "accessories", label: "Accessories" },
  { id: "bags", label: "Bags" },
];

export function groupLabel(group: StylebookGroup): string {
  return STYLEBOOK_GROUPS.find((g) => g.id === group)?.label ?? group;
}

/** categoryId -> group, for categories that have a Stylebook group set. */
export function buildGroupMap(categories: Category[]): Map<string, StylebookGroup> {
  const map = new Map<string, StylebookGroup>();
  for (const category of categories) {
    if (category.stylebookGroup) map.set(category.id, category.stylebookGroup);
  }
  return map;
}

/** Union of the subcategories of every category mapped to `group`, de-duplicated by id. */
export function subcategoryChips(
  categories: Category[],
  group: StylebookGroup,
): { id: string; name: string }[] {
  const seen = new Set<string>();
  const out: { id: string; name: string }[] = [];
  for (const category of categories) {
    if (category.stylebookGroup !== group) continue;
    for (const sub of category.subcategories) {
      if (seen.has(sub.id)) continue;
      seen.add(sub.id);
      out.push({ id: sub.id, name: sub.name });
    }
  }
  return out;
}

export interface TagCount {
  name: string;
  count: number;
}

/**
 * Tag usage counts with case variants merged ("Linen"/"linen" -> one entry),
 * matching pickerFilter's case-insensitive tag matching. The first-seen casing
 * (in item order) wins; each item counts once per merged tag. Sorted like
 * `topTags` (count desc, then name). `limit` omitted = full list.
 */
export function mergedTagCounts(items: OrganizingItem[], limit?: number): TagCount[] {
  const byKey = new Map<string, TagCount>();
  for (const item of items) {
    const keysInItem = new Set<string>();
    for (const tag of item.tags) {
      const key = tag.label.trim().toLowerCase();
      if (!key || keysInItem.has(key)) continue;
      keysInItem.add(key);
      const existing = byKey.get(key);
      if (existing) existing.count += 1;
      else byKey.set(key, { name: tag.label.trim(), count: 1 });
    }
  }
  const sorted = [...byKey.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
  return limit === undefined ? sorted : sorted.slice(0, limit);
}

const sameTag = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function isTagSelected(selected: string[], name: string): boolean {
  return selected.some((t) => sameTag(t, name));
}

/** Adds `name` to the selection, or removes it (case-insensitively) if present. */
export function toggleTag(selected: string[], name: string): string[] {
  return isTagSelected(selected, name)
    ? selected.filter((t) => !sameTag(t, name))
    : [...selected, name];
}

/**
 * Chips for the tag row: every selected tag first (always visible, so it can be
 * cleared even when it is not a top tag here or a query is active), then the
 * top unselected tags up to `limit` total.
 */
export function visibleTagChips(
  top: TagCount[],
  selected: string[],
  limit: number,
): { name: string; count: number | null; active: boolean }[] {
  const chips: { name: string; count: number | null; active: boolean }[] = selected.map((name) => ({
    name,
    count: top.find((t) => sameTag(t.name, name))?.count ?? null,
    active: true,
  }));
  for (const tag of top) {
    if (chips.length >= Math.max(limit, selected.length)) break;
    if (isTagSelected(selected, tag.name)) continue;
    chips.push({ name: tag.name, count: tag.count, active: false });
  }
  return chips;
}

// ---- Filters and empty states ---------------------------------------------

export function hasActiveFilters(filter: PickerFilter): boolean {
  return Boolean(filter.subcategoryId || filter.tags.length > 0 || filter.query.trim());
}

export function clearedFilter(filter: PickerFilter): PickerFilter {
  return { group: filter.group, subcategoryId: null, tags: [], query: "" };
}

export interface EmptyMessage {
  heading: string;
  body: string;
  showClear: boolean;
}

/**
 * Copy for an empty result. `subcategoryName` is the name of the selected
 * subcategory chip (ignored while a query is active, since search spans all
 * groups and subcategories).
 */
export function emptyStateMessage(args: {
  hasGroupedCategory: boolean;
  filter: PickerFilter;
  subcategoryName: string | null;
}): EmptyMessage {
  const { hasGroupedCategory, filter, subcategoryName } = args;
  if (!hasGroupedCategory) {
    return {
      heading: "No categories are set up for Stylebook yet",
      body: "Edit a category and choose a Stylebook group in the category form to see its pieces here.",
      showClear: false,
    };
  }
  const query = filter.query.trim();
  const tags = filter.tags.map((t) => `#${t}`).join(" ");
  if (!hasActiveFilters(filter)) {
    return {
      heading: "No pieces here yet",
      body: `Nothing in ${groupLabel(filter.group)} yet. Add items to your closet, or try another group.`,
      showClear: false,
    };
  }
  const what = query ? `pieces matching "${query}"` : "pieces";
  const withTags = tags ? ` with ${tags}` : "";
  const where = query ? " in any group" : ` in ${subcategoryName ?? groupLabel(filter.group)}`;
  return {
    heading: "No pieces here yet",
    body: `No ${what}${withTags}${where}.`,
    showClear: true,
  };
}
