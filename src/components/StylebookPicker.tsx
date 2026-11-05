import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Check, FolderCog, PackageSearch, Search, X } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { useCategories } from "../hooks/useCategories";
import { useItems } from "../hooks/useItems";
import { filterItems, type PickerFilter } from "../lib/pickerFilter";
import {
  STYLEBOOK_GROUPS,
  buildGroupMap,
  clampSheetHeight,
  clearedFilter,
  emptyStateMessage,
  isTagSelected,
  mergedTagCounts,
  nextSnapOnTap,
  pickSnap,
  snapHeights,
  subcategoryChips,
  toggleTag,
  visibleTagChips,
  type SnapName,
} from "../lib/pickerModel";
import type { StylebookGroup } from "../lib/placement";
import type { OrganizingItem } from "../types";

interface StylebookPickerProps {
  /** Tapping a tile adds one copy of the item to the canvas. */
  onAdd(item: OrganizingItem): void;
  /** Tapping a tile's check badge removes the most recently added copy. */
  onUndoLast(itemId: string): void;
  /** How many copies of each item are on the canvas. */
  countsByItemId: Record<string, number>;
  /** Current settled sheet height in px (also fired on mount and container resize). */
  onHeightChange?(px: number): void;
}

const TOP_TAG_LIMIT = 6;
const TAP_SLOP_PX = 6;

const viewportHeight = () => (typeof window === "undefined" ? 800 : window.innerHeight);

function PickerTile({
  item,
  count,
  onAdd,
  onUndoLast,
}: {
  item: OrganizingItem;
  count: number;
  onAdd(item: OrganizingItem): void;
  onUndoLast(itemId: string): void;
}) {
  const Icon = item.icon;
  const src = item.cutoutURL || item.imageURL;
  const onCanvas = count > 0;
  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => onAdd(item)}
        aria-label={`Add ${item.name}`}
        className={`flex w-full flex-col gap-1 rounded-cute-s border-2 bg-cute-surface p-1 text-left transition hover:shadow-[0_6px_14px_rgba(74,63,85,0.12)] ${
          onCanvas ? "border-cute-primary" : "border-transparent"
        }`}
      >
        <div className="aspect-square w-full overflow-hidden rounded-[10px] bg-cute-surface-alt">
          {src ? (
            <img
              src={src}
              alt=""
              loading="lazy"
              draggable={false}
              className={`h-full w-full ${item.cutoutURL ? "object-contain" : "object-cover"}`}
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center"
              style={{ backgroundColor: item.iconBg }}
            >
              <Icon size={24} color={item.iconColor} />
            </div>
          )}
        </div>
        <p className="truncate px-0.5 font-body text-[11px] font-medium text-cute-text">{item.name}</p>
      </button>
      {onCanvas && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onUndoLast(item.id);
          }}
          aria-label={`Remove last ${item.name} from canvas (${count} on canvas)`}
          className="absolute top-1 right-1 flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full bg-cute-primary px-1.5 font-body text-[11px] font-bold text-cute-primary-foreground shadow"
        >
          <Check size={13} strokeWidth={3} />
          {count >= 2 && <span>{count}</span>}
        </button>
      )}
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
  variant = "solid",
  trailing,
}: {
  label: string;
  active: boolean;
  onClick(): void;
  variant?: "solid" | "tag";
  trailing?: ReactNode;
}) {
  const inactive =
    variant === "tag"
      ? "border border-dashed border-cute-primary bg-transparent text-cute-primary"
      : "border border-transparent bg-cute-surface-alt text-cute-text";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1 font-body text-xs font-semibold whitespace-nowrap transition ${
        active ? "border border-cute-primary bg-cute-primary text-cute-primary-foreground" : inactive
      }`}
    >
      {label}
      {trailing}
    </button>
  );
}

/**
 * Bottom-sheet item picker for the Stylebook canvas. Overlays the bottom of its
 * positioned container (never resizes the canvas) with three snap heights.
 * Only the drag handle captures touch; the tile grid scrolls natively.
 */
export function StylebookPicker({ onAdd, onUndoLast, countsByItemId, onHeightChange }: StylebookPickerProps) {
  const { categories, apiCategories, loading: categoriesLoading, error: categoriesError } = useCategories();
  const { items, loading: itemsLoading, error: itemsError } = useItems(apiCategories);

  const [filter, setFilter] = useState<PickerFilter>({
    group: "clothes",
    subcategoryId: null,
    tags: [],
    query: "",
  });
  const [moreTagsOpen, setMoreTagsOpen] = useState(false);

  // ---- Sheet height / snapping ----
  // Snaps are sized from the positioned parent the sheet overlays (it is
  // overflow-hidden in the builder, so a viewport-sized snap would clip the
  // handle). The viewport height is only the fallback before it is measured.
  const sectionRef = useRef<HTMLElement>(null);
  const [vh, setVh] = useState(viewportHeight);
  const [containerHeight, setContainerHeight] = useState<number | null>(null);
  const [snap, setSnap] = useState<SnapName>("half");
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const availableHeight = containerHeight ?? vh;
  const heights = useMemo(() => snapHeights(availableHeight), [availableHeight]);
  const settledHeight = heights[snap];
  const height = dragHeight ?? settledHeight;
  const drag = useRef<{ startY: number; startHeight: number; lastY: number; lastT: number; velocity: number; moved: boolean } | null>(null);

  useEffect(() => {
    const onResize = () => setVh(viewportHeight());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useLayoutEffect(() => {
    const parent = sectionRef.current?.parentElement;
    if (!parent) return;
    const update = () => {
      const h = parent.clientHeight;
      if (h > 0) setContainerHeight((prev) => (prev === h ? prev : h));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  // Fires on mount, on every snap change and whenever the container (or,
  // before it is measured, the viewport) resizes, since settledHeight depends
  // on availableHeight. Intermediate drag heights are not reported.
  useEffect(() => {
    onHeightChange?.(settledHeight);
  }, [settledHeight, onHeightChange]);

  const onHandlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      startY: event.clientY,
      startHeight: settledHeight,
      lastY: event.clientY,
      lastT: event.timeStamp,
      velocity: 0,
      moved: false,
    };
  };

  const onHandlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(event.clientY - d.startY) > TAP_SLOP_PX) d.moved = true;
    const dt = event.timeStamp - d.lastT;
    if (dt > 0) d.velocity = (d.lastY - event.clientY) / dt; // px/ms, positive = growing
    d.lastY = event.clientY;
    d.lastT = event.timeStamp;
    if (d.moved) setDragHeight(clampSheetHeight(d.startHeight + (d.startY - event.clientY), heights));
  };

  const onHandlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!d.moved) {
      setSnap((current) => nextSnapOnTap(current));
    } else {
      const released = clampSheetHeight(d.startHeight + (d.startY - event.clientY), heights);
      setSnap(pickSnap(released, d.velocity, heights));
    }
    setDragHeight(null);
  };

  const onHandlePointerCancel = () => {
    drag.current = null;
    setDragHeight(null);
  };

  const onHandleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const order: SnapName[] = ["peek", "half", "full"];
    const i = order.indexOf(snap);
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSnap(order[Math.min(order.length - 1, i + 1)]);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setSnap(order[Math.max(0, i - 1)]);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSnap(nextSnapOnTap(snap));
    }
  };

  // ---- Filtering ----
  const groupMap = useMemo(() => buildGroupMap(categories), [categories]);
  const hasGroupedCategory = groupMap.size > 0;
  const subChips = useMemo(() => subcategoryChips(categories, filter.group), [categories, filter.group]);
  const activeSubName = subChips.find((s) => s.id === filter.subcategoryId)?.name ?? null;
  const queryActive = filter.query.trim().length > 0;

  // Tags offered = tags of the items in the current group + subcategory (ignoring tag/query filters).
  const tagCounts = useMemo(
    () =>
      mergedTagCounts(
        filterItems(items, groupMap, { group: filter.group, subcategoryId: filter.subcategoryId, tags: [], query: "" }),
      ),
    [items, groupMap, filter.group, filter.subcategoryId],
  );
  const tagChips = visibleTagChips(tagCounts, filter.tags, TOP_TAG_LIMIT);

  const results = useMemo(() => filterItems(items, groupMap, filter), [items, groupMap, filter]);

  const selectGroup = (group: StylebookGroup) =>
    setFilter((f) => (f.group === group ? f : { ...f, group, subcategoryId: null }));
  const selectSub = (subcategoryId: string | null) => setFilter((f) => ({ ...f, subcategoryId }));
  const onToggleTag = (name: string) => setFilter((f) => ({ ...f, tags: toggleTag(f.tags, name) }));
  const clearFilters = () => {
    setFilter((f) => clearedFilter(f));
    setMoreTagsOpen(false);
  };

  const error = categoriesError || itemsError;
  const loading = (categoriesLoading && categories.length === 0) || (itemsLoading && items.length === 0);

  let body: ReactNode;
  if (error) {
    body = (
      <p className="w-full py-8 text-center font-body text-sm text-cute-danger">Couldn't load your closet: {error}</p>
    );
  } else if (loading) {
    body = <p className="w-full py-8 text-center font-body text-sm text-cute-text-muted">Loading your closet…</p>;
  } else if (!hasGroupedCategory || results.length === 0) {
    const msg = emptyStateMessage({ hasGroupedCategory, filter, subcategoryName: activeSubName });
    body = (
      <EmptyState
        icon={hasGroupedCategory ? PackageSearch : FolderCog}
        heading={msg.heading}
        body={msg.body}
        action={msg.showClear ? { label: "Clear filters", onClick: clearFilters } : undefined}
        className="py-6"
      />
    );
  } else {
    body = (
      <div className="grid grid-cols-4 gap-2">
        {results.map((item) => (
          <PickerTile
            key={item.id}
            item={item}
            count={countsByItemId[item.id] ?? 0}
            onAdd={onAdd}
            onUndoLast={onUndoLast}
          />
        ))}
      </div>
    );
  }

  const showControls = !error && !loading && hasGroupedCategory;

  return (
    <section
      ref={sectionRef}
      aria-label="Add pieces"
      className={`absolute inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-[24px] border border-b-0 border-cute-border bg-cute-surface shadow-[0_-8px_24px_rgba(74,53,56,0.12)] ${
        dragHeight === null ? "transition-[height] duration-200 ease-out" : ""
      }`}
      style={{ height }}
    >
      <button
        type="button"
        aria-label={`Resize picker (currently ${snap})`}
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerCancel}
        onKeyDown={onHandleKeyDown}
        style={{ touchAction: "none" }}
        className="flex h-6 w-full shrink-0 cursor-grab items-center justify-center active:cursor-grabbing"
      >
        <span className="h-1 w-9 rounded-full bg-cute-border" />
      </button>

      <div className="flex shrink-0 flex-col gap-2 px-3.5 pb-2">
        <div role="group" aria-label="Stylebook group" className="flex w-full rounded-full bg-cute-surface-alt p-0.5">
          {STYLEBOOK_GROUPS.map((g) => {
            const active = g.id === filter.group;
            return (
              <button
                key={g.id}
                type="button"
                aria-pressed={active}
                onClick={() => selectGroup(g.id)}
                className={`min-w-0 flex-1 truncate rounded-full px-1 py-1.5 font-body text-xs font-bold transition ${
                  active ? "bg-cute-primary text-cute-primary-foreground" : "text-cute-text"
                }`}
              >
                {g.label}
              </button>
            );
          })}
        </div>

        {showControls && (
          <>
            <label className="flex items-center gap-2 rounded-full border border-cute-border bg-cute-surface px-3 py-1.5">
              <Search size={15} className="shrink-0 text-cute-text-muted" />
              <input
                type="search"
                value={filter.query}
                onChange={(event) => setFilter((f) => ({ ...f, query: event.target.value }))}
                placeholder="Search all pieces"
                aria-label="Search pieces"
                className="min-w-0 flex-1 bg-transparent font-body text-sm text-cute-text outline-none placeholder:text-cute-text-muted"
              />
            </label>
            {queryActive && (
              <p className="font-body text-[11px] font-semibold text-cute-text-muted">
                Showing results from all groups
              </p>
            )}

            {!queryActive && (
              <div className="-mx-3.5 flex gap-1.5 overflow-x-auto px-3.5 pb-0.5">
                <Chip label="All" active={filter.subcategoryId === null} onClick={() => selectSub(null)} />
                {subChips.map((s) => (
                  <Chip
                    key={s.id}
                    label={s.name}
                    active={filter.subcategoryId === s.id}
                    onClick={() => selectSub(s.id)}
                  />
                ))}
              </div>
            )}

            {(tagChips.length > 0 || tagCounts.length > 0) && (
              <div className="-mx-3.5 flex items-center gap-1.5 overflow-x-auto px-3.5 pb-0.5">
                <span className="shrink-0 font-body text-[11px] font-bold text-cute-text-muted">Tags</span>
                {tagChips.map((t) => (
                  <Chip
                    key={t.name.toLowerCase()}
                    label={`#${t.name}`}
                    variant="tag"
                    active={t.active}
                    onClick={() => onToggleTag(t.name)}
                    trailing={t.active ? <X size={12} strokeWidth={3} aria-hidden /> : undefined}
                  />
                ))}
                {tagCounts.length > 0 && (
                  <Chip
                    label={moreTagsOpen ? "Fewer tags ‹" : "More tags ›"}
                    active={false}
                    onClick={() => setMoreTagsOpen((open) => !open)}
                  />
                )}
              </div>
            )}

            {moreTagsOpen && tagCounts.length > 0 && (
              <div
                aria-label="All tags"
                className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-cute-s bg-cute-surface-alt p-2"
              >
                {tagCounts.map((t) => (
                  <Chip
                    key={t.name.toLowerCase()}
                    label={`#${t.name} · ${t.count}`}
                    variant="tag"
                    active={isTagSelected(filter.tags, t.name)}
                    onClick={() => onToggleTag(t.name)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 pb-4">{body}</div>
    </section>
  );
}
