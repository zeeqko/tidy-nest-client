import { Shirt } from "lucide-react";
import { Link } from "react-router-dom";
import type { ApiLook, ApiLookItem } from "../api/looks";
import { thumbnailLayout } from "../lib/lookThumbnail";
import { lookTileLabel } from "../lib/styleBookList";

/** Square-fit layout (see `thumbnailLayout`: cropped to the rotated bounds,
 *  uniformly scaled, centred) in paint order. Assumes (x, y) is the
 *  unrotated top-left corner and rotation pivots around the box's center
 *  (CSS default transform-origin), matching the canvas. */
function layoutItems(items: ApiLookItem[]) {
  return thumbnailLayout(items).sort((a, b) => a.zIndex - b.zIndex);
}

/** Style Book list tile: a single link to the look's detail page whose only
 *  visible content is the outfit collage (each placed item's photo,
 *  positioned/scaled/rotated per its saved transform). From `sm` up, a
 *  caption (name left, occasion right) fades in under the tile on hover
 *  (hover-capable pointers only: Tailwind's `hover` variant is gated on
 *  `(hover: hover)`) and on keyboard focus; its row height is always
 *  reserved so nothing shifts. Below `sm` there is no caption at all. The
 *  link's accessible name comes from `aria-label`, so the (aria-hidden)
 *  caption isn't read twice. */
export function LookCard({ look }: { look: ApiLook }) {
  const layout = look.items.length > 0 ? layoutItems(look.items) : [];

  return (
    <Link
      to={`/stylebook/${look.id}`}
      aria-label={lookTileLabel(look)}
      className="group flex w-full flex-col outline-none"
    >
      {/* Tile: soft square; a hairline border on the phone only (per the phone
          mock). The focus ring sits on the tile, not around the caption.
          The inset padding keeps pieces off the rounded corners. */}
      <div
        data-testid="look-tile"
        className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border border-cute-border bg-cute-surface-alt p-[9%] outline-offset-2 outline-cute-primary group-focus-visible:outline-2 sm:border-0"
      >
        {/* `isolate` scopes the items' saved z-indexes (sparse, possibly
            negative on older looks) to this composite. */}
        <div data-testid="look-thumbnail" className="relative isolate aspect-square w-full">
          {layout.length > 0 ? (
            layout.map((item, index) => {
              const src = item.cutoutURL || item.imageURL;
              return (
                <div
                  key={`${item.itemId}-${index}`}
                  className="absolute"
                  style={{
                    left: `${item.leftPct}%`,
                    top: `${item.topPct}%`,
                    width: `${item.widthPct}%`,
                    height: `${item.heightPct}%`,
                    transform: `rotate(${item.rotation}deg)`,
                    zIndex: item.zIndex,
                  }}
                >
                  {src ? (
                    <img
                      src={src}
                      alt=""
                      className={`h-full w-full rounded-cute-s ${item.cutoutURL ? "object-contain" : "object-cover"}`}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-cute-s bg-cute-surface-alt text-cute-text-muted">
                      <Shirt size={16} />
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="flex h-full w-full items-center justify-center text-cute-text-muted">
              <Shirt size={32} />
            </div>
          )}
        </div>
      </div>
      <div
        aria-hidden="true"
        data-testid="look-caption"
        className="mt-1.5 hidden h-5 items-baseline justify-between gap-2 px-0.5 opacity-0 transition-opacity duration-150 motion-reduce:transition-none group-hover:opacity-100 group-focus-visible:opacity-100 sm:flex"
      >
        <span className="min-w-0 truncate font-body text-[12.5px] font-semibold text-cute-text">{look.name}</span>
        {look.occasion.trim() && (
          <span className="shrink-0 font-body text-cute-11 font-medium text-cute-text-muted">{look.occasion}</span>
        )}
      </div>
    </Link>
  );
}
