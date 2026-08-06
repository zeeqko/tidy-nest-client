import { Shirt } from "lucide-react";
import type { ApiLook, ApiLookItem } from "../api/looks";

interface LookCardProps {
  look: ApiLook;
}

interface PlacedLayout extends ApiLookItem {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

/** Maps each placed item's saved (x, y, width, height) transform onto
 *  percentages of a square thumbnail box, uniformly scaled (never
 *  stretched) so the composite stays proportional to how the look was
 *  actually arranged, then centered on whichever axis has slack.
 *  Assumes (x, y) is the unrotated top-left corner and rotation pivots
 *  around the box's center (CSS default transform-origin) — the canvas
 *  that produces these transforms must rotate around the same pivot or
 *  saved-vs-rendered rotation will diverge. */
function layoutItems(items: ApiLookItem[]): PlacedLayout[] {
  const minX = Math.min(...items.map((item) => item.x));
  const minY = Math.min(...items.map((item) => item.y));
  const maxX = Math.max(...items.map((item) => item.x + item.width));
  const maxY = Math.max(...items.map((item) => item.y + item.height));
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const span = Math.max(spanX, spanY);
  const offsetX = (span - spanX) / 2;
  const offsetY = (span - spanY) / 2;

  return [...items]
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((item) => ({
      ...item,
      leftPct: ((item.x - minX + offsetX) / span) * 100,
      topPct: ((item.y - minY + offsetY) / span) * 100,
      widthPct: (item.width / span) * 100,
      heightPct: (item.height / span) * 100,
    }));
}

/** Style Book gallery card: a composited thumbnail (each placed item's raw
 *  photo, positioned/scaled/rotated per its saved transform) plus name +
 *  piece count. Per open question 6, cards are inert — no tap/select/delete
 *  affordance this pass. */
export function LookCard({ look }: LookCardProps) {
  const layout = look.items.length > 0 ? layoutItems(look.items) : [];

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-cute-l border border-cute-border bg-cute-surface shadow-[0_6px_16px_rgba(74,63,85,0.08)]">
      <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-cute-surface-alt">
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
                  <div className="h-full w-full rounded-cute-s bg-cute-surface-alt" />
                )}
              </div>
            );
          })
        ) : (
          <div className="flex h-full w-full items-center justify-center text-cute-text-muted">
            <Shirt size={40} />
          </div>
        )}
        {look.occasion && (
          // z-index above any placed item's saved zIndex (items carry
          // explicit positive z-index, so this badge needs one too — an
          // unset/auto z-index here would still paint underneath them).
          <span
            className="absolute top-2.5 right-2.5 z-[1000] max-w-[65%] truncate rounded-full bg-white/90 px-2.5 py-1 font-body text-[11px] font-semibold text-cute-text"
          >
            {look.occasion}
          </span>
        )}
      </div>

      <div className="flex w-full flex-col gap-0.5 p-3 sm:p-4">
        <h3 className="line-clamp-2 font-heading text-base font-medium text-cute-text">
          {look.name}
        </h3>
        <p className="truncate font-body text-xs text-cute-text-muted">
          {look.items.length} {look.items.length === 1 ? "piece" : "pieces"}
        </p>
      </div>
    </div>
  );
}
