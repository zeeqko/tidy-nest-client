import type { OrganizingItem } from "../types";

interface ItemsGridProps {
  items: OrganizingItem[];
  onSelect?: (item: OrganizingItem) => void;
}

/** Compact photo card from the All Items (Mobile) design: photo with the first
 *  tag overlaid, then a two-line name. Edit/delete live in the detail modal. */
export function CompactItemCard({
  item,
  onSelect,
}: {
  item: OrganizingItem;
  onSelect?: (item: OrganizingItem) => void;
}) {
  const Icon = item.icon;
  const tag = item.tags[0];

  return (
    <button
      type="button"
      onClick={() => onSelect?.(item)}
      className="flex w-full flex-col overflow-hidden rounded-cute-m border border-cute-border bg-cute-surface text-left shadow-[0_2px_6px_rgba(74,63,85,0.06)] transition hover:shadow-[0_6px_14px_rgba(74,63,85,0.12)]"
    >
      <div className="relative aspect-[11/9] w-full shrink-0">
        {item.imageURL ? (
          <img src={item.imageURL} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ backgroundColor: item.iconBg }}
          >
            <Icon size={26} color={item.iconColor} />
          </div>
        )}
        {tag && (
          <span
            className="absolute bottom-1.5 left-1.5 rounded-full px-2 py-[3px] font-body text-[9px] font-semibold"
            style={{ backgroundColor: tag.bg, color: tag.fg }}
          >
            {tag.label}
          </span>
        )}
      </div>
      <div className="w-full px-2 pt-2 pb-2.5">
        <h3 className="line-clamp-2 min-h-[30px] font-heading text-xs leading-tight font-semibold text-cute-text">
          {item.name}
        </h3>
      </div>
    </button>
  );
}

export function ItemsGrid({ items, onSelect }: ItemsGridProps) {
  if (items.length === 0) {
    return (
      <p className="w-full py-12 text-center font-body text-sm text-cute-text-muted">
        No items match your search.
      </p>
    );
  }

  return (
    <div className="grid w-full grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
      {items.map((item) => (
        <CompactItemCard key={item.id} item={item} onSelect={onSelect} />
      ))}
    </div>
  );
}
