import { Package } from "lucide-react";
import { categoryIconOptions, defaultCategoryColour } from "../data/categoryIcons";
import { illustrationIcons } from "../data/categories";

interface CategoryBadgeProps {
  iconSrc?: string;
  iconName?: string;
  colour?: string;
  /** Diameter in pixels. */
  size: number;
  /** Tailwind size classes (e.g. "size-16 sm:size-21") that override `size`
   *  so one badge can resize responsively; the glyph scales with the circle. */
  sizeClassName?: string;
  className?: string;
}

const CREAM = "#FFF1E0";

/**
 * Round category visual: the bundled illustration when one is set (whether
 * passed pre-resolved via `iconSrc`, or by name via `iconName` — so a
 * user-created category picking e.g. "food" renders identically to a seeded
 * one), otherwise the same recipe drawn from the category's own colour: flat
 * circle, cream-filled glyph outlined in a darker shade of that colour, and
 * a small sparkle once the badge is big enough to carry it.
 */
export function CategoryBadge({ iconSrc, iconName, colour, size, sizeClassName, className }: CategoryBadgeProps) {
  const sizeStyle = sizeClassName ? undefined : { width: size, height: size };
  const resolvedSrc = iconSrc ?? (iconName ? illustrationIcons[iconName] : undefined);
  if (resolvedSrc) {
    return (
      <img
        src={resolvedSrc}
        alt=""
        style={sizeStyle}
        className={`shrink-0 rounded-full object-cover ${sizeClassName ?? ""} ${className ?? ""}`}
      />
    );
  }

  const Icon = (iconName && categoryIconOptions[iconName]) || Package;
  const bg = colour ?? defaultCategoryColour;
  const ink = `color-mix(in srgb, ${bg} 55%, #000)`;
  return (
    <span
      style={{ ...sizeStyle, backgroundColor: bg }}
      className={`relative flex shrink-0 items-center justify-center rounded-full ${sizeClassName ?? ""} ${className ?? ""}`}
    >
      <Icon className="size-[52%]" fill={CREAM} stroke={ink} strokeWidth={2} />
      {size >= 40 && (
        <svg viewBox="-10 -10 20 20" className="absolute top-[14%] right-[12%] size-[18%]" aria-hidden="true">
          <path d="M0 -10 L3 -3 L10 0 L3 3 L0 10 L-3 3 L-10 0 L-3 -3 Z" fill={CREAM} stroke={ink} strokeWidth={2} strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}
