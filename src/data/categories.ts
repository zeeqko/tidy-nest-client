import type { Category } from "../types";
import food from "../assets/categories/food.png";
import clothes from "../assets/categories/clothes.png";
import makeup from "../assets/categories/makeup.png";
import shoes from "../assets/categories/shoes.png";
import bags from "../assets/categories/bags.png";
import books from "../assets/categories/books.png";

export const categories: Category[] = [
  { id: "all", label: "All" },
  { id: "food", label: "Food", iconSrc: food },
  { id: "clothes", label: "Clothes", iconSrc: clothes },
  { id: "makeup", label: "Makeup", iconSrc: makeup },
  { id: "shoes", label: "Shoes", iconSrc: shoes },
  { id: "bags", label: "Bags", iconSrc: bags },
  { id: "books", label: "Books", iconSrc: books },
];
