import {
  Beef,
  BookOpen,
  Calendar,
  CalendarX,
  Footprints,
  MapPin,
  Milk,
  Package,
  PackageOpen,
  RotateCcw,
  Shirt,
  ShoppingBag,
  Sparkles,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import type { ApiCategory } from "../api/categories";
import type { ApiInventoryItem } from "../api/inventory";
import { categoryIconOptions } from "./categoryIcons";
import type { Chip, OrganizingItem } from "../types";

interface CategoryPreset {
  chip: Chip;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
}

// Keyed by the six seeded categories' stable `icon` value (not their display
// name), so renaming a seeded category — "Food" to "Groceries" — keeps its
// preset instead of falling through to fallbackPreset. A category's `icon`
// only changes if the user explicitly re-picks one in the editor.
const illustrationPresets: Record<string, CategoryPreset> = {
  food: {
    chip: { label: "Food", bg: "#FFD873", fg: "#6B4F00" },
    icon: Utensils,
    iconBg: "#FFD87340",
    iconColor: "#6B4F00",
  },
  clothes: {
    chip: { label: "Clothes", bg: "#C9B6FF", fg: "#4A3F66" },
    icon: Shirt,
    iconBg: "#C9B6FF33",
    iconColor: "#4A3F66",
  },
  makeup: {
    chip: { label: "Makeup", bg: "#FF7A90", fg: "#7A1F33" },
    icon: Sparkles,
    iconBg: "#FF7A9022",
    iconColor: "#7A1F33",
  },
  shoes: {
    chip: { label: "Shoes", bg: "#FF8FAB", fg: "#FFFFFF" },
    icon: Footprints,
    iconBg: "#FF8FAB26",
    iconColor: "#FFFFFF",
  },
  bags: {
    chip: { label: "Bags", bg: "#B8EFC0", fg: "#1F5C2A" },
    icon: ShoppingBag,
    iconBg: "#B8EFC055",
    iconColor: "#1F5C2A",
  },
  books: {
    chip: { label: "Books", bg: "#6B4F00", fg: "#FFFFFF" },
    icon: BookOpen,
    iconBg: "#6B4F0022",
    iconColor: "#FFFFFF",
  },
};

/** Plain grey preset used wherever there's no category (or, for Look items
 *  synthesised from `ApiLookItem`, no category info at all) to fall back to
 *  — exported so other surfaces that need the same "no photo" icon/colour
 *  treatment don't invent their own colours. */
export const fallbackPreset: CategoryPreset = {
  chip: { label: "Other", bg: "#E7E2EE", fg: "#4A3F55" },
  icon: Package,
  iconBg: "#E7E2EE66",
  iconColor: "#4A3F55",
};

/** Builds a preset from a user-created category's own colour/icon, so it
 *  reads as deliberate rather than always falling to the grey fallback. */
function presetFromCategory(category: ApiCategory): CategoryPreset {
  const illustration = category.icon ? illustrationPresets[category.icon] : undefined;
  if (illustration) return illustration;

  const icon = (category.icon && categoryIconOptions[category.icon]) || Package;
  const bg = category.colour ?? fallbackPreset.chip.bg;
  return {
    chip: { label: category.name, bg, fg: fallbackPreset.chip.fg },
    icon,
    iconBg: `${bg}40`,
    iconColor: fallbackPreset.chip.fg,
  };
}

const subcategoryIcons: Record<string, LucideIcon> = {
  Dairy: Milk,
  Meat: Beef,
};

const tagChips: Record<string, Chip> = {
  Fresh: { label: "Fresh", bg: "#B8EFC0", fg: "#1F5C2A" },
  Frozen: { label: "Frozen", bg: "#D6ECFF", fg: "#1B4D89" },
  Winter: { label: "Winter", bg: "#D6ECFF", fg: "#1B4D89" },
  Summer: { label: "Summer", bg: "#FFE9A8", fg: "#8A6A00" },
};

export function tagChip(label: string, colour?: string): Chip {
  return (
    tagChips[label] ??
    (colour
      ? { label, bg: colour, fg: "#4A3F55" }
      : { label, bg: "#E7E2EE", fg: "#4A3F55" })
  );
}

function statusChip(label: string): Chip {
  if (/today|expired|overdue/i.test(label)) {
    return { label, bg: "#FF7A90", fg: "#7A1F33" };
  }
  return { label, bg: "#B8EFC0", fg: "#1F5C2A" };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Maps a backend inventory item onto the UI's presentation shape. `categories`
 *  (the caller's already-loaded list) resolves the item's category by id to
 *  get its current colour/icon — falls back to a plain grey preset (labeled
 *  from the item's own `category` name) only when the category can't be
 *  found at all, e.g. it was since deleted. */
export function toOrganizingItem(
  item: ApiInventoryItem,
  categories: ApiCategory[] = [],
): OrganizingItem {
  const category = categories.find((c) => String(c.id) === item.categoryId);
  // Always show the category's current name, even when its preset comes from
  // a hardcoded illustration entry keyed by a stable icon string that
  // doesn't change on rename.
  const preset = category
    ? { ...presetFromCategory(category), chip: { ...presetFromCategory(category).chip, label: category.name } }
    : { ...fallbackPreset, chip: { ...fallbackPreset.chip, label: item.category || "Other" } };
  // Falls back once the item's subcategory was deleted (API sends "") so
  // filter chips, the item card subtitle, and the detail view never render
  // a blank pill.
  const subcategory = item.subcategory || "Other";

  return {
    id: item.id,
    name: item.name,
    subtitle: item.subtitle || `${subcategory} · ${item.quantity}`,
    location: item.location,
    icon: subcategoryIcons[item.subcategory] ?? preset.icon,
    iconBg: preset.iconBg,
    iconColor: preset.iconColor,
    category: preset.chip,
    subcategory,
    categoryId: item.categoryId,
    subCategoryId: item.subCategoryId,
    quantity: item.quantity,
    imageURL: item.imageURL,
    cutoutURL: item.cutoutURL,
    expiryDate: item.expiryDate,
    opensOn: item.opensOn,
    tags: (item.tags ?? []).map((tag) => tagChip(tag.name, tag.colour)),
    status: item.status ? statusChip(item.status) : undefined,
    stats: [
      { icon: Package, label: "Quantity", value: String(item.quantity), helper: item.subtitle },
      { icon: MapPin, label: "Location", value: item.location, helper: "Storage spot" },
      { icon: Calendar, label: "Added", value: formatDate(item.createdAt), helper: "First tracked" },
    ],
    details: [
      { icon: MapPin, label: "Storage Location", value: item.location },
      ...(item.opensOn
        ? [{ icon: PackageOpen, label: "Open Date", value: formatDate(item.opensOn) }]
        : []),
      ...(item.expiryDate
        ? [{ icon: CalendarX, label: "Expiry Date", value: formatDate(item.expiryDate) }]
        : []),
      { icon: Calendar, label: "Added", value: formatDate(item.createdAt) },
      { icon: RotateCcw, label: "Last Updated", value: formatDate(item.updatedAt) },
    ],
    notes: item.notes ?? "",
  };
}
