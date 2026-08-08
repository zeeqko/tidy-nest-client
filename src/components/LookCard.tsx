import { Pencil, Shirt, Trash2 } from "lucide-react";
import type { ApiLook, ApiLookItem } from "../api/looks";

interface LookCardProps {
  look: ApiLook;
  onSelect?: (look: ApiLook) => void;
  onEdit?: (look: ApiLook) => void;
  onDelete?: (look: ApiLook) => void;
}

interface PlacedLayout extends ApiLookItem {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

/** Icon-pill edit/delete row, treatment lifted verbatim from `ItemCard`'s
 *  `EditDeleteButtons` (same sizes, colour tokens, and `aria-label` shape)
 *  so the two card families read identically. Each button stops both click
 *  and keydown propagation so a press (mouse or keyboard) never also
 *  triggers the ancestor card's own `onSelect` navigation — the card is a
 *  `role="button"` with its own Enter/Space handler, so an un-stopped
 *  keydown would otherwise bubble up and fire card select alongside (or
 *  instead of) the button's action. */
function EditDeleteButtons({
  look,
  onEdit,
  onDelete,
}: {
  look: ApiLook;
  onEdit?: (look: ApiLook) => void;
  onDelete?: (look: ApiLook) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onEdit?.(look);
        }}
        onKeyDown={(event) => event.stopPropagation()}
        aria-label={`Edit ${look.name}`}
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
          onDelete?.(look);
        }}
        onKeyDown={(event) => event.stopPropagation()}
        aria-label={`Delete ${look.name}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-cute-destructive transition hover:brightness-95"
      >
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-cute-destructive/15">
          <Trash2 size={13} />
        </span>
      </button>
    </div>
  );
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
 *  piece count. Selecting the card (anywhere outside the action buttons)
 *  navigates to the look's detail page; the pencil/trash icons navigate to
 *  edit or open a delete confirmation, mirroring `ItemCard`/`CategoryPage`'s
 *  wiring shape via optional `onSelect`/`onEdit`/`onDelete` callbacks owned
 *  by the parent page. */
export function LookCard({ look, onSelect, onEdit, onDelete }: LookCardProps) {
  const layout = look.items.length > 0 ? layoutItems(look.items) : [];
  const hasActions = Boolean(onEdit || onDelete);

  return (
    <div
      onClick={() => onSelect?.(look)}
      onKeyDown={(event) => {
        if (!onSelect) return;
        // Defense in depth: the action buttons already stop propagation on
        // both click and keydown, so this should never see a bubbled event
        // from them — but only react to keydowns targeting the card itself,
        // never a descendant, in case that ever changes.
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(look);
        }
      }}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      // `isolate` gives this card its own stacking context so the occasion
      // badge's z-[1000] below is scoped locally (winning only against this
      // card's own placed items) instead of competing in the document's
      // root stacking context, where it could otherwise paint above
      // higher-level UI like modal overlays. See T5.
      className="isolate flex w-full cursor-pointer flex-col overflow-hidden rounded-cute-l border border-cute-border bg-cute-surface shadow-[0_6px_16px_rgba(74,63,85,0.08)] transition hover:shadow-[0_10px_24px_rgba(74,63,85,0.14)]"
    >
      <div className="relative flex h-[170px] w-full shrink-0 items-center justify-center overflow-hidden bg-cute-surface-alt">
        {/* Fixed-height band matching ItemCard's h-[170px] image block; the
         *  composite itself stays a square (never stretched — see
         *  layoutItems' docstring) sized to the lesser of the band's height
         *  and the card's width, and is centered on both axes within the
         *  band. */}
        <div className="relative aspect-square w-full max-w-[170px]">
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
        </div>
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
        <div className="flex w-full flex-wrap items-center justify-between gap-1.5">
          <p className="truncate font-body text-xs text-cute-text-muted">
            {look.items.length} {look.items.length === 1 ? "piece" : "pieces"}
          </p>
          {hasActions && <EditDeleteButtons look={look} onEdit={onEdit} onDelete={onDelete} />}
        </div>
      </div>
    </div>
  );
}
