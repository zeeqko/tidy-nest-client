import { Pencil, Shirt, Trash2 } from "lucide-react";
import type { ApiLook, ApiLookItem } from "../api/looks";
import { thumbnailLayout } from "../lib/lookThumbnail";

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

/** Icon-pill edit/delete row (30px pills in 44px tap targets, `aria-label`
 *  shape "Edit <name>" / "Delete <name>"). Each button stops both click
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

/** Square-fit layout (see `thumbnailLayout`: cropped to the rotated bounds,
 *  uniformly scaled, centred) in paint order. Assumes (x, y) is the
 *  unrotated top-left corner and rotation pivots around the box's center
 *  (CSS default transform-origin), matching the canvas. */
function layoutItems(items: ApiLookItem[]): PlacedLayout[] {
  return thumbnailLayout(items).sort((a, b) => a.zIndex - b.zIndex);
}

/** Style Book gallery card: a composited thumbnail (each placed item's raw
 *  photo, positioned/scaled/rotated per its saved transform) plus name +
 *  piece count. Selecting the card (anywhere outside the action buttons)
 *  navigates to the look's detail page; the pencil/trash icons navigate to
 *  edit or open a delete confirmation. The page owns the optional
 *  `onSelect`/`onEdit`/`onDelete` callbacks. */
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
      <div className="relative flex aspect-square w-full shrink-0 items-center justify-center overflow-hidden bg-cute-surface-alt">
        {/* Square band; the composite itself stays a square (never stretched — see
         *  layoutItems' docstring) sized to the lesser of the band's height
         *  and the card's width, and is centered on both axes within the
         *  band. `isolate` scopes the items' saved z-indexes (sparse, possibly
         *  negative on older looks) to this composite, so none can paint
         *  over the occasion badge or behind the band's background. */}
        <div className="relative isolate aspect-square w-full">
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
              <Shirt size={40} />
            </div>
          )}
        </div>
        {look.occasion && (
          // The items' z-indexes are scoped inside the isolated composite
          // (a sibling painted earlier), but the badge still needs an
          // explicit z-index to be sure it paints above that composite.
          <span
            className="absolute top-2.5 right-2.5 z-[1000] max-w-[65%] truncate rounded-full bg-white/90 px-2.5 py-1 font-body text-cute-11 font-semibold text-cute-text"
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
