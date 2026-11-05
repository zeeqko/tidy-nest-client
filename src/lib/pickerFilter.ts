import type { OrganizingItem } from "../types";
import type { StylebookGroup } from "./placement";

export interface PickerFilter {
  group: StylebookGroup;
  subcategoryId: string | null;
  tags: string[];
  query: string;
}

const norm = (s: string) => s.trim().toLowerCase();

export function filterItems(
  items: OrganizingItem[],
  groupByCategoryId: Map<string, StylebookGroup>,
  filter: PickerFilter,
): OrganizingItem[] {
  const query = norm(filter.query);
  const wanted = filter.tags.map(norm);
  return items.filter((item) => {
    const group = item.categoryId ? groupByCategoryId.get(item.categoryId) : undefined;
    if (!group) return false;
    const names = item.tags.map((t) => norm(t.label));
    if (!wanted.every((t) => names.includes(t))) return false;
    if (query) {
      return (
        norm(item.name).includes(query) ||
        norm(item.subcategory).includes(query) ||
        names.some((n) => n.includes(query))
      );
    }
    if (group !== filter.group) return false;
    if (filter.subcategoryId && item.subCategoryId !== filter.subcategoryId) return false;
    return true;
  });
}

export function topTags(items: OrganizingItem[], limit = 6): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const name of new Set(item.tags.map((t) => t.label))) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}
