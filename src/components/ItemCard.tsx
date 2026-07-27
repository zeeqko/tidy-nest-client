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
  const tag = item.tags[0];

  return (
    <div
      onClick={() => onSelect?.(item)}
      className="flex w-full cursor-pointer flex-col overflow-hidden rounded-cute-l border border-cute-border bg-cute-surface shadow-[0_6px_16px_rgba(74,63,85,0.08)] transition hover:shadow-[0_10px_24px_rgba(74,63,85,0.14)]"
    >
      <div className="relative h-[170px] w-full shrink-0">
        {item.imageURL ? (
          <img src={item.imageURL} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ backgroundColor: item.iconBg }}
          >
            <Icon size={40} color={item.iconColor} />
          </div>
        )}
        {chipMode === "category" ? (
          <span
            className="absolute top-2.5 right-2.5 rounded-full px-2.5 py-1 font-body text-[11px] font-semibold"
            style={{ backgroundColor: item.category.bg, color: item.category.fg }}
          >
            {item.category.label}
          </span>
        ) : (
          item.subcategory && (
            <span className="absolute top-2.5 right-2.5 rounded-full bg-white/90 px-2.5 py-1 font-body text-[11px] font-semibold text-cute-text">
              {item.subcategory}
            </span>
          )
        )}
        {tag && (
          <span
            className="absolute bottom-2.5 left-2.5 rounded-full px-2.5 py-1 font-body text-[11px] font-semibold"
            style={{ backgroundColor: tag.bg, color: tag.fg }}
          >
            {tag.label}
          </span>
        )}
      </div>

      <div className="flex w-full flex-col gap-2.5 p-4">
        <div className="flex w-full flex-col gap-0.5">
          <h3 className="font-heading text-base font-medium text-cute-text">{item.name}</h3>
          <p className="font-body text-xs text-cute-text-muted">{item.subtitle}</p>
        </div>

        <div className="flex items-center gap-[5px]">
          <MapPin size={12} className="shrink-0 text-cute-text-muted" />
          <span className="truncate font-body text-xs text-cute-text-muted">
            {item.location}
          </span>
        </div>

        <div className="flex w-full items-center justify-between">
          {item.status ? (
            <span
              className="rounded-full px-3 py-[5px] font-body text-[11px] font-semibold"
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
              className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-cute-surface-alt text-cute-text-muted transition hover:brightness-95"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete?.(item);
              }}
              aria-label={`Delete ${item.name}`}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#FF7A9022] text-cute-danger transition hover:brightness-95"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
