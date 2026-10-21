import { useState, type KeyboardEvent } from "react";
import { MapPin } from "lucide-react";
import type { OrganizingItem } from "../types";

interface ItemCardProps {
  item: OrganizingItem;
  /** "full" is the photo-only 4:5 card with the name over a bottom scrim (plus a
   *  category chip at every size); location and quantity are only
   *  shown in the detail modal. "compact" is the horizontal row card mirroring
   *  the mobile Home category list and does show name, location and quantity. */
  density?: "compact" | "full";
  /** Full card only: omit the category chip (e.g. on the category page, where
   *  every card is already in that category). */
  hideChip?: boolean;
  onSelect?: (item: OrganizingItem) => void;
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

function CompactCard({ item, onSelect }: ItemCardProps) {
  const Icon = item.icon;
  const chipLabel = item.category.label;

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
              className="shrink-0 rounded-full px-2 py-[2px] font-body text-cute-10 font-semibold"
              style={{ backgroundColor: item.status.bg, color: item.status.fg }}
            >
              {item.status.label}
            </span>
          )}
        </div>
        <LocationLine item={item} size={11} />
        {chipLabel && (
          <p className="truncate font-body text-cute-11 text-cute-text-muted">{chipLabel}</p>
        )}
      </div>
    </div>
  );
}

function FullCard({ item, hideChip = false, onSelect }: ItemCardProps) {
  const Icon = item.icon;
  const [failedURL, setFailedURL] = useState<string | null>(null);
  const showImage = !!item.imageURL && failedURL !== item.imageURL;
  const handleCardClick = () => onSelect?.(item);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault(); // Space must not scroll the page
      handleCardClick();
    }
  };

  return (
    <div
      data-testid="item-card"
      data-item-id={item.id}
      role="button"
      tabIndex={0}
      aria-label={item.name}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      className="relative aspect-[4/5] w-full cursor-pointer select-none overflow-hidden rounded-cute-l border border-cute-border bg-cute-surface-alt shadow-[0_6px_16px_rgba(74,63,85,0.08)] transition [-webkit-touch-callout:none] hover:shadow-[0_10px_24px_rgba(74,63,85,0.14)] outline-none focus-visible:outline-2 focus-visible:outline-transparent focus-visible:[box-shadow:0_0_0_2px_#fff,0_0_0_5px_#4a3f55]"
    >
      {showImage ? (
        <img
          src={item.imageURL}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={() => setFailedURL(item.imageURL ?? null)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: item.iconBg }}
        >
          <Icon size={40} color={item.iconColor} className="size-7 -translate-y-2 sm:size-10 sm:translate-y-0" />
        </div>
      )}

      {!hideChip && (
        <span
          data-testid="item-chip"
          className="absolute top-1.5 right-1.5 max-w-[calc(100%-0.75rem)] truncate rounded-full px-1.5 py-0.5 font-body text-[10px] leading-3 font-semibold sm:top-2.5 sm:right-2.5 sm:max-w-[calc(100%-1.25rem)] sm:px-2.5 sm:py-1 sm:text-cute-11 sm:leading-normal"
          style={{ backgroundColor: item.category.bg, color: item.category.fg }}
        >
          {item.category.label}
        </span>
      )}

      {/* Bottom scrim keeps the name readable on light photos and placeholders. */}
      <div data-testid="item-scrim" className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/45 to-transparent px-2 pt-6 pb-2 sm:px-3 sm:pt-8 sm:pb-3 md:px-4 md:pb-4">
        <h3 className="line-clamp-2 font-heading text-xs leading-4 font-medium text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.4)] sm:text-sm sm:leading-5 md:text-base">
          {item.name}
        </h3>
      </div>
    </div>
  );
}

export function ItemCard({ density = "full", ...props }: ItemCardProps) {
  return density === "compact" ? <CompactCard {...props} /> : <FullCard {...props} />;
}
