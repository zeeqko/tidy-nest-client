import {
  BookOpen,
  Footprints,
  Gift,
  Heart,
  Shirt,
  ShoppingBag,
  Sparkles,
  Utensils,
  type LucideIcon,
} from "lucide-react";

/** Lucide icons offered by the category editor, keyed by their stored name. */
export const categoryIconOptions: Record<string, LucideIcon> = {
  utensils: Utensils,
  shirt: Shirt,
  sparkles: Sparkles,
  footprints: Footprints,
  "shopping-bag": ShoppingBag,
  "book-open": BookOpen,
  gift: Gift,
  heart: Heart,
};

export const defaultCategoryColour = "#FFD873";
