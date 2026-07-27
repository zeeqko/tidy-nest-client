import type { LucideIcon } from "lucide-react";

export interface Chip {
  label: string;
  bg: string;
  fg: string;
}

export interface StatEntry {
  icon: LucideIcon;
  label: string;
  value: string;
  helper: string;
}

export interface DetailRow {
  icon: LucideIcon;
  label: string;
  value: string;
}

export interface OrganizingItem {
  id: string;
  name: string;
  subtitle: string;
  location: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  category: Chip;
  subcategory: string;
  quantity: number;
  /** Same-origin URL of the item's photo, shown in place of the icon. */
  imageURL?: string;
  /** Optional dates in YYYY-MM-DD form (for editing). */
  expiryDate?: string;
  opensOn?: string;
  tags: Chip[];
  status?: Chip;
  stats: StatEntry[];
  details: DetailRow[];
  notes: string;
}

/** What a modal changed, so parents refresh only the affected data. */
export interface RefreshScope {
  categories: boolean;
  items: boolean;
}

export interface Category {
  id: string;
  label: string;
  iconSrc?: string;
  /** Lucide icon name chosen in the category editor (used when no image exists). */
  iconName?: string;
  colour?: string;
}
