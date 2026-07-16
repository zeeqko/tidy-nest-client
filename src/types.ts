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
  tag?: Chip;
  status?: Chip;
  stats: StatEntry[];
  details: DetailRow[];
  notes: string;
}

export interface Category {
  id: string;
  label: string;
  iconSrc?: string;
}
