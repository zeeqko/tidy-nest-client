import { Package } from "lucide-react";
import { categoryIconOptions, defaultCategoryColour } from "../data/categoryIcons";
import { illustrationIcons } from "../data/categories";

interface CategoryBadgeProps {
  iconSrc?: string;
  iconName?: string;
  colour?: string;
  /** Diameter in pixels. */
  size: number;
  className?: string;
}

/**
 * Round category visual: the bundled illustration when one is set (whether
 * passed pre-resolved via `iconSrc`, or by name via `iconName` — so a
 * user-created category picking e.g. "food" renders identically to a seeded
 * one), otherwise a circle tinted from the category's own colour with its
 * chosen lucide icon, sized to read as deliberate rather than a placeholder.
 */
export function CategoryBadge({ iconSrc, iconName, colour, size, className }: CategoryBadgeProps) {
  const resolvedSrc = iconSrc ?? (iconName ? illustrationIcons[iconName] : undefined);
  if (resolvedSrc) {
    return (
      <img
        src={resolvedSrc}
        alt=""
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-full object-cover ${className ?? ""}`}
      />
    );
  }

  const Icon = (iconName && categoryIconOptions[iconName]) || Package;
  return (
    <span
      style={{ width: size, height: size, backgroundColor: colour ?? defaultCategoryColour }}
      className={`flex shrink-0 items-center justify-center rounded-full text-cute-accent-foreground ${className ?? ""}`}
    >
      <Icon size={Math.round(size * 0.55)} strokeWidth={2.25} />
    </span>
  );
}
