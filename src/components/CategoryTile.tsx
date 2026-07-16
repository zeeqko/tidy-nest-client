import { Link } from "react-router-dom";

interface CategoryTileProps {
  to: string;
  iconSrc?: string;
  label: string;
  itemCount: number;
  subcategorySummary: string;
}

export function CategoryTile({
  to,
  iconSrc,
  label,
  itemCount,
  subcategorySummary,
}: CategoryTileProps) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-3 rounded-cute-l border border-cute-border bg-cute-surface-alt p-5 text-center transition hover:brightness-95"
    >
      {iconSrc && (
        <img src={iconSrc} alt="" className="h-16 w-16 rounded-full object-cover" />
      )}
      <div className="flex flex-col gap-1">
        <p className="font-heading text-[17px] font-semibold text-cute-text">{label}</p>
        <p className="font-body text-[13px] text-cute-text-muted">
          {itemCount} {itemCount === 1 ? "item" : "items"}
        </p>
        {subcategorySummary && (
          <p className="font-body text-[11px] text-cute-text-muted">{subcategorySummary}</p>
        )}
      </div>
    </Link>
  );
}
