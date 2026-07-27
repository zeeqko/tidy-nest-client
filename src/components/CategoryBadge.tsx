import { Package } from "lucide-react";
import { categoryIconOptions, defaultCategoryColour } from "../data/categoryIcons";

interface CategoryBadgeProps {
  iconSrc?: string;
  iconName?: string;
  colour?: string;
  /** Diameter in pixels. */
  size: number;
  className?: string;
}

/**
 * Round category visual: the bundled image when one exists, otherwise a
 * coloured circle with the category's chosen lucide icon.
 */
export function CategoryBadge({ iconSrc, iconName, colour, size, className }: CategoryBadgeProps) {
  if (iconSrc) {
    return (
      <img
        src={iconSrc}
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
      <Icon size={Math.round(size * 0.45)} />
    </span>
  );
}
