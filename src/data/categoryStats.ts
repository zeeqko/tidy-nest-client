import type { Chip, Category, OrganizingItem } from "../types";

export interface CategoryStats extends Omit<Category, "subcategories"> {
  itemCount: number;
  /** Subcategory names, derived from category.subcategories so empty ones
   * still appear (not filtered down to only those present on items). */
  subcategories: string[];
  locations: string[];
  tags: (Chip & { count: number })[];
}

export function getCategoryStats(
  categories: Category[],
  items: OrganizingItem[],
): CategoryStats[] {
  return categories.map((category) => {
    const categoryItems = items.filter((item) => item.categoryId === category.id);
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
      subcategories: category.subcategories.map((sub) => sub.name),
      locations: Array.from(new Set(categoryItems.map((item) => item.location))),
      tags: Array.from(tagMap.values()),
    };
  });
}
