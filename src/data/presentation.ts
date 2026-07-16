import {
  Beef,
  BookOpen,
  Calendar,
  Footprints,
  MapPin,
  Milk,
  Package,
  RotateCcw,
  Shirt,
  ShoppingBag,
  Sparkles,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import type { ApiInventoryItem } from "../api/inventory";
import type { Chip, OrganizingItem } from "../types";

interface CategoryPreset {
  chip: Chip;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
}

const categoryPresets: Record<string, CategoryPreset> = {
  Food: {
    chip: { label: "Food", bg: "#FFD873", fg: "#6B4F00" },
    icon: Utensils,
    iconBg: "#FFD87340",
    iconColor: "#6B4F00",
  },
  Clothes: {
    chip: { label: "Clothes", bg: "#C9B6FF", fg: "#4A3F66" },
    icon: Shirt,
    iconBg: "#C9B6FF33",
    iconColor: "#4A3F66",
  },
  Makeup: {
    chip: { label: "Makeup", bg: "#FF7A90", fg: "#7A1F33" },
    icon: Sparkles,
    iconBg: "#FF7A9022",
    iconColor: "#7A1F33",
  },
  Shoes: {
    chip: { label: "Shoes", bg: "#FF8FAB", fg: "#FFFFFF" },
    icon: Footprints,
    iconBg: "#FF8FAB26",
    iconColor: "#FFFFFF",
  },
  Bags: {
    chip: { label: "Bags", bg: "#B8EFC0", fg: "#1F5C2A" },
    icon: ShoppingBag,
    iconBg: "#B8EFC055",
    iconColor: "#1F5C2A",
  },
  Books: {
    chip: { label: "Books", bg: "#6B4F00", fg: "#FFFFFF" },
    icon: BookOpen,
    iconBg: "#6B4F0022",
    iconColor: "#FFFFFF",
  },
};

const fallbackPreset: CategoryPreset = {
  chip: { label: "Other", bg: "#E7E2EE", fg: "#4A3F55" },
  icon: Package,
  iconBg: "#E7E2EE66",
  iconColor: "#4A3F55",
};

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

function tagChip(label: string): Chip {
  return tagChips[label] ?? { label, bg: "#E7E2EE", fg: "#4A3F55" };
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

/** Maps a backend inventory item onto the UI's presentation shape. */
export function toOrganizingItem(item: ApiInventoryItem): OrganizingItem {
  const preset = categoryPresets[item.category] ?? {
    ...fallbackPreset,
    chip: { ...fallbackPreset.chip, label: item.category || "Other" },
  };

  return {
    id: item.id,
    name: item.name,
    subtitle: item.subtitle || `${item.subcategory} · ${item.quantity}`,
    location: item.location,
    icon: subcategoryIcons[item.subcategory] ?? preset.icon,
    iconBg: preset.iconBg,
    iconColor: preset.iconColor,
    category: preset.chip,
    subcategory: item.subcategory,
    tag: item.tag ? tagChip(item.tag) : undefined,
    status: item.status ? statusChip(item.status) : undefined,
    stats: [
      { icon: Package, label: "Quantity", value: String(item.quantity), helper: item.subtitle },
      { icon: MapPin, label: "Location", value: item.location, helper: "Storage spot" },
      { icon: Calendar, label: "Added", value: formatDate(item.createdAt), helper: "First tracked" },
    ],
    details: [
      { icon: MapPin, label: "Storage Location", value: item.location },
      { icon: Calendar, label: "Added", value: formatDate(item.createdAt) },
      { icon: RotateCcw, label: "Last Updated", value: formatDate(item.updatedAt) },
    ],
    notes: item.notes ?? "",
  };
}
