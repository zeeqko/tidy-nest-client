import { MapPin, Pencil, Trash2 } from "lucide-react";
import type { OrganizingItem } from "../types";

interface ItemCardProps {
  item: OrganizingItem;
  /** "full" is the large photo card (Category Modal design); "compact" is the
   *  horizontal row card mirroring the mobile Home category list. Both always
   *  carry name + location + quantity so the same item reads identically
   *  everywhere it appears. */
  density?: "compact" | "full";
  chipMode?: "category" | "subcategory";
  onSelect?: (item: OrganizingItem) => void;
  onEdit?: (item: OrganizingItem) => void;
  onDelete?: (item: OrganizingItem) => void;
}

function EditDeleteButtons({
  item,
  onEdit,
  onDelete,
}: {
  item: OrganizingItem;
  onEdit?: (item: OrganizingItem) => void;
  onDelete?: (item: OrganizingItem) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onEdit?.(item);
        }}
        aria-label={`Edit ${item.name}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-cute-text-muted transition hover:brightness-95"
      >
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-cute-surface-alt">
          <Pencil size={13} />
        </span>
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDelete?.(item);
        }}
        aria-label={`Delete ${item.name}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-cute-destructive transition hover:brightness-95"
      >
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-cute-destructive/15">
          <Trash2 size={13} />
        </span>
      </button>
    </div>
  );
}

/** Location + quantity line, shared by both densities so every card carries
 *  the same two fields regardless of where it's rendered. */
function LocationLine({ item, size = 12 }: { item: OrganizingItem; size?: number }) {
  return (
    <div className="flex min-w-0 items-center gap-[5px]">
      <MapPin size={size} className="shrink-0 text-cute-text-muted" />
      <span className="min-w-0 flex-1 truncate font-body text-xs text-cute-text-muted">
        {item.location}
      </span>
      <span className="shrink-0 font-body text-xs text-cute-text-muted">
        Qty {item.quantity}
      </span>
    </div>
  );
}

function CompactCard({ item, chipMode = "category", onSelect, onEdit, onDelete }: ItemCardProps) {
  const Icon = item.icon;
  const hasActions = Boolean(onEdit || onDelete);
  const chipLabel = chipMode === "category" ? item.category.label : item.subcategory;

  return (
    <div
      onClick={() => onSelect?.(item)}
      className="flex w-full cursor-pointer items-center gap-3 rounded-cute-l border border-cute-border bg-cute-surface p-3 shadow-[0_3px_10px_-2px_rgba(74,63,85,0.06)] transition hover:shadow-[0_6px_14px_rgba(74,63,85,0.12)]"
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-cute-m">
        {item.imageURL ? (
          <img src={item.imageURL} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ backgroundColor: item.iconBg }}
          >
            <Icon size={24} color={item.iconColor} />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="min-w-0 truncate font-heading text-sm font-medium text-cute-text">
            {item.name}
          </h3>
          {item.status && (
            <span
              className="shrink-0 rounded-full px-2 py-[2px] font-body text-[10px] font-semibold"
              style={{ backgroundColor: item.status.bg, color: item.status.fg }}
            >
              {item.status.label}
            </span>
          )}
        </div>
        <LocationLine item={item} size={11} />
        {chipLabel && (
          <p className="truncate font-body text-[11px] text-cute-text-muted">{chipLabel}</p>
        )}
      </div>
      {hasActions && <EditDeleteButtons item={item} onEdit={onEdit} onDelete={onDelete} />}
    </div>
  );
}

function FullCard({ item, chipMode = "category", onSelect, onEdit, onDelete }: ItemCardProps) {
  const Icon = item.icon;
  const tag = item.tags[0];
  const hasActions = Boolean(onEdit || onDelete);

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

        <LocationLine item={item} />

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
          {hasActions && <EditDeleteButtons item={item} onEdit={onEdit} onDelete={onDelete} />}
        </div>
      </div>
    </div>
  );
}

export function ItemCard({ density = "full", ...props }: ItemCardProps) {
  return density === "compact" ? <CompactCard {...props} /> : <FullCard {...props} />;
}
