import { categories } from "./categories";
import type { Chip, OrganizingItem } from "../types";

export interface CategoryStats {
  id: string;
  label: string;
  iconSrc?: string;
  itemCount: number;
  subcategories: string[];
  locations: string[];
  tags: (Chip & { count: number })[];
}

export function getCategoryStats(items: OrganizingItem[]): CategoryStats[] {
  return categories
    .filter((category) => category.id !== "all")
    .map((category) => {
      const categoryItems = items.filter(
        (item) => item.category.label === category.label,
      );
      const tagMap = new Map<string, Chip & { count: number }>();
      for (const item of categoryItems) {
        if (!item.tag) continue;
        const existing = tagMap.get(item.tag.label);
        if (existing) existing.count += 1;
        else tagMap.set(item.tag.label, { ...item.tag, count: 1 });
      }
      return {
        ...category,
        itemCount: categoryItems.length,
        subcategories: Array.from(new Set(categoryItems.map((item) => item.subcategory))),
        locations: Array.from(new Set(categoryItems.map((item) => item.location))),
        tags: Array.from(tagMap.values()),
      };
    });
}
