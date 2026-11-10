import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { CategoryBadge } from "./CategoryBadge";
import { resolveCategoryColour } from "../lib/categoryColour";

interface CategoryTileProps {
  to: string;
  iconSrc?: string;
  iconName?: string;
  /** Raw stored icon key; lets built-in icons supply a tint when no colour is stored. */
  iconKey?: string;
  colour?: string;
  label: string;
  itemCount: number;
  /** Optional summary line under the item count; omitted on Home. */
  subcategories?: string[];
}

/** "Milk, Beef" for two, "Milk, Beef +3" once there are more than two —
 * keeps the subtitle short instead of letting a long comma list truncate
 * mid-word. */
function summarizeSubcategories(subcategories: string[]): string {
  const shown = subcategories.slice(0, 2).join(", ");
  const rest = subcategories.length - 2;
  return rest > 0 ? `${shown} +${rest}` : shown;
}

/** Horizontal row card on mobile, centered tile on sm+ (per UI.pen). Shared
 * by HomePage and AllCategoriesPage so both screens render one tile. */
export function CategoryTile({
  to,
  iconSrc,
  iconName,
  iconKey,
  colour,
  label,
  itemCount,
  subcategories = [],
}: CategoryTileProps) {
  const subcategorySummary = summarizeSubcategories(subcategories);
  const tint = resolveCategoryColour(colour, iconKey ?? iconName);
  // On sm+ the tile is tinted from its category colour; without one it keeps
  // the neutral surface-alt look. The mobile row stays on white.
  const tintStyle = tint
    ? ({
        "--tile-bg": `color-mix(in srgb, ${tint} 16%, #fff)`,
        "--tile-border": `color-mix(in srgb, ${tint} 30%, #fff)`,
      } as CSSProperties)
    : undefined;
  return (
    <Link
      to={to}
      style={tintStyle}
      className={`group flex min-w-0 items-center gap-3.5 rounded-cute-l border border-cute-border bg-cute-surface p-3.5 shadow-[0_3px_10px_-2px_rgba(74,63,85,0.06)] transition sm:flex-col sm:gap-3 sm:p-5 sm:text-center sm:shadow-none ${
        tint ? "sm:border-(--tile-border) sm:bg-(--tile-bg)" : "sm:bg-cute-surface-alt"
      }`}
    >
      <CategoryBadge
        iconSrc={iconSrc}
        iconName={iconName}
        colour={tint}
        size={64}
        sizeClassName="size-16 sm:size-21"
        className="motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-focus-visible:-translate-y-1 motion-safe:sm:group-hover:-translate-y-1"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:max-w-full sm:flex-none sm:gap-1">
        <p className="min-w-0 truncate break-words font-heading text-base font-medium text-cute-text sm:text-cute-17 sm:font-semibold">
          {label}
        </p>
        <p className="font-body text-cute-13 text-cute-text-muted">
          {itemCount} {itemCount === 1 ? "item" : "items"}
        </p>
        {subcategorySummary && (
          <p className="truncate font-body text-cute-11 text-cute-text-muted">
            {subcategorySummary}
          </p>
        )}
      </div>
      <ChevronRight size={18} className="shrink-0 text-cute-text-muted sm:hidden" />
    </Link>
  );
}
