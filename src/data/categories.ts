import type { ApiCategory } from "../api/categories";
import type { Category } from "../types";
import food from "../assets/categories/food.png";
import clothes from "../assets/categories/clothes.png";
import makeup from "../assets/categories/makeup.png";
import shoes from "../assets/categories/shoes.png";
import bags from "../assets/categories/bags.png";
import books from "../assets/categories/books.png";

/** Maps a backend icon name to its bundled image. */
const categoryIcons: Record<string, string> = {
  food,
  clothes,
  makeup,
  shoes,
  bags,
  books,
};

export const allCategory: Category = { id: "all", label: "All" };

export function toUiCategory(category: ApiCategory): Category {
  return {
    id: String(category.id),
    label: category.name,
    iconSrc: category.icon ? categoryIcons[category.icon] : undefined,
    iconName: category.icon && !categoryIcons[category.icon] ? category.icon : undefined,
    colour: category.colour ?? undefined,
  };
}
