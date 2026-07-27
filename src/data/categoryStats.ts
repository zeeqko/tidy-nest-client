import type { Chip, Category, OrganizingItem } from "../types";

export interface CategoryStats extends Category {
  itemCount: number;
  subcategories: string[];
  locations: string[];
  tags: (Chip & { count: number })[];
}

export function getCategoryStats(
  categories: Category[],
  items: OrganizingItem[],
): CategoryStats[] {
  return categories.map((category) => {
    const categoryItems = items.filter(
      (item) => item.category.label === category.label,
    );
    const tagMap = new Map<string, Chip & { count: number }>();
    for (const item of categoryItems) {
      for (const tag of item.tags) {
        const existing = tagMap.get(tag.label);
        if (existing) existing.count += 1;
        else tagMap.set(tag.label, { ...tag, count: 1 });
      }
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
