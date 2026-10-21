import type { OrganizingItem } from "../types";

export interface AggregatedTag {
  label: string;
  bg: string;
  fg: string;
  count: number;
}

/** Unique tags across items (first-seen order and colours), with usage counts. */
export function aggregateTags(items: OrganizingItem[]): AggregatedTag[] {
  const map = new Map<string, AggregatedTag>();
  for (const item of items) {
    for (const tag of item.tags) {
      const existing = map.get(tag.label);
      if (existing) existing.count += 1;
      else map.set(tag.label, { ...tag, count: 1 });
    }
  }
  return Array.from(map.values());
}
