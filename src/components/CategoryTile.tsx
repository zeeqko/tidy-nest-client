import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { CategoryBadge } from "./CategoryBadge";

interface CategoryTileProps {
  to: string;
  iconSrc?: string;
  iconName?: string;
  colour?: string;
  label: string;
  itemCount: number;
  subcategorySummary: string;
}

/** Horizontal row card on mobile, centered tile on sm+ (per UI.pen). */
export function CategoryTile({
  to,
  iconSrc,
  iconName,
  colour,
  label,
  itemCount,
  subcategorySummary,
}: CategoryTileProps) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3.5 rounded-cute-l border border-cute-border bg-cute-surface p-3.5 shadow-[0_3px_10px_-2px_rgba(74,63,85,0.06)] transition sm:flex-col sm:gap-3 sm:bg-cute-surface-alt sm:p-5 sm:text-center sm:shadow-none sm:hover:brightness-95"
    >
      <span className="sm:hidden">
        <CategoryBadge iconSrc={iconSrc} iconName={iconName} colour={colour} size={56} />
      </span>
      <span className="hidden sm:block">
        <CategoryBadge iconSrc={iconSrc} iconName={iconName} colour={colour} size={64} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-none sm:gap-1">
        <p className="truncate font-heading text-base font-medium text-cute-text sm:text-[17px] sm:font-semibold">
          {label}
        </p>
        <p className="font-body text-[13px] text-cute-text-muted">
          {itemCount} {itemCount === 1 ? "item" : "items"}
        </p>
        {subcategorySummary && (
          <p className="truncate font-body text-[11px] text-cute-text-muted">
            {subcategorySummary}
          </p>
        )}
      </div>
      <ChevronRight size={18} className="shrink-0 text-cute-text-muted sm:hidden" />
    </Link>
  );
}
