import type { ApiCategory } from "../api/categories";
import type { Category } from "../types";
import food from "../assets/categories/food.png";
import clothes from "../assets/categories/clothes.png";
import makeup from "../assets/categories/makeup.png";
import shoes from "../assets/categories/shoes.png";
import bags from "../assets/categories/bags.png";
import books from "../assets/categories/books.png";

/** Maps a backend icon name to its bundled image. Exported so the category
 *  editor's icon picker can offer these as choices for ANY category, not
 *  just the six seeded ones. */
export const illustrationIcons: Record<string, string> = {
  food,
  clothes,
  makeup,
  shoes,
  bags,
  books,
};

export const allCategory: Category = { id: "all", label: "All", subcategories: [] };

export function toUiCategory(category: ApiCategory): Category {
  return {
    id: String(category.id),
    label: category.name,
    iconSrc: category.icon ? illustrationIcons[category.icon] : undefined,
    iconName: category.icon && !illustrationIcons[category.icon] ? category.icon : undefined,
    colour: category.colour ?? undefined,
    subcategories: category.subCategories.map((sc) => ({ id: String(sc.id), name: sc.name })),
  };
}
