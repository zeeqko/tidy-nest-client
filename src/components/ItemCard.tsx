import { MapPin, Pencil, Trash2 } from "lucide-react";
import type { OrganizingItem } from "../types";

interface ItemCardProps {
  item: OrganizingItem;
  chipMode?: "category" | "subcategory";
  onSelect?: (item: OrganizingItem) => void;
  onEdit?: (item: OrganizingItem) => void;
  onDelete?: (item: OrganizingItem) => void;
}

export function ItemCard({
  item,
  chipMode = "category",
  onSelect,
  onEdit,
  onDelete,
}: ItemCardProps) {
  const Icon = item.icon;

  return (
    <div
      onClick={() => onSelect?.(item)}
      className="flex w-full cursor-pointer flex-col gap-3 rounded-cute-l border border-cute-border bg-cute-surface p-[18px] shadow-[0_4px_12px_-2px_rgba(74,63,85,0.06)] transition hover:shadow-[0_8px_20px_-4px_rgba(74,63,85,0.12)]"
    >
      <div className="flex w-full items-center justify-between">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-cute-m"
          style={{ backgroundColor: item.iconBg }}
        >
          <Icon size={22} color={item.iconColor} />
        </div>
        {chipMode === "category" ? (
          <span
            className="rounded-full px-2.5 py-1 font-body text-[11px] font-semibold"
            style={{ backgroundColor: item.category.bg, color: item.category.fg }}
          >
            {item.category.label}
          </span>
        ) : (
          <span className="rounded-full bg-cute-surface-alt px-2.5 py-1 font-body text-[11px] font-semibold text-cute-text">
            {item.subcategory}
          </span>
        )}
      </div>

      <div className="flex w-full flex-col gap-0.5">
        <h3 className="font-heading text-base font-medium text-cute-text">
          {item.name}
        </h3>
        <p className="font-body text-xs text-cute-text-muted">{item.subtitle}</p>
      </div>

      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-[5px]">
          <MapPin size={12} className="text-cute-text-muted" />
          <span className="font-body text-[11px] text-cute-text-muted">
            {item.location}
          </span>
        </div>
        {item.tag && (
          <span
            className="rounded-full px-[9px] py-[3px] font-body text-[11px] font-semibold"
            style={{ backgroundColor: item.tag.bg, color: item.tag.fg }}
          >
            {item.tag.label}
          </span>
        )}
      </div>

      <div className="flex w-full items-center justify-between">
        {item.status ? (
          <span
            className="rounded-full px-3 py-[5px] font-body text-xs font-semibold"
            style={{ backgroundColor: item.status.bg, color: item.status.fg }}
          >
            {item.status.label}
          </span>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onEdit?.(item);
            }}
            aria-label={`Edit ${item.name}`}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-cute-surface-alt text-cute-text-muted transition hover:brightness-95"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete?.(item);
            }}
            aria-label={`Delete ${item.name}`}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FF7A9022] text-cute-danger transition hover:brightness-95"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
