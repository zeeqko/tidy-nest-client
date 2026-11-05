import { useMemo, useState, type ReactNode } from "react";
import { Check, FolderCog, PackageSearch, Search, X } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { useCategories } from "../hooks/useCategories";
import { useItems } from "../hooks/useItems";
import { filterItems, type PickerFilter } from "../lib/pickerFilter";
import {
  STYLEBOOK_GROUPS,
  buildGroupMap,
  clearedFilter,
  emptyStateMessage,
  isTagSelected,
  mergedTagCounts,
  subcategoryChips,
  toggleTag,
  visibleTagChips,
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
}

const TOP_TAG_LIMIT = 6;

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
        <p className="truncate px-0.5 font-body text-[10px] font-medium text-cute-text lg:text-xs">{item.name}</p>
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
  expanded,
}: {
  label: string;
  active: boolean;
  onClick(): void;
  variant?: "solid" | "tag";
  trailing?: ReactNode;
  /** When set, the chip is a disclosure (`aria-expanded`) rather than a
   *  toggle (`aria-pressed`). */
  expanded?: boolean;
}) {
  const inactive =
    variant === "tag"
      ? "border border-dashed border-cute-primary bg-transparent text-cute-primary"
      : "border border-transparent bg-cute-surface-alt text-cute-text";
  return (
    <button
      type="button"
      onClick={onClick}
      {...(expanded === undefined ? { "aria-pressed": active } : { "aria-expanded": expanded })}
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
 * Docked item picker for the Stylebook builder: a plain panel that fills its
 * parent (the page sizes it, beside the canvas on desktop and below it on a
 * phone). The filter controls stay put and only the tile grid scrolls.
 */
export function StylebookPicker({ onAdd, onUndoLast, countsByItemId }: StylebookPickerProps) {
  const { categories, apiCategories, loading: categoriesLoading, error: categoriesError } = useCategories();
  const { items, loading: itemsLoading, error: itemsError } = useItems(apiCategories);

  const [filter, setFilter] = useState<PickerFilter>({
    group: "clothes",
    subcategoryId: null,
    tags: [],
    query: "",
  });
  const [moreTagsOpen, setMoreTagsOpen] = useState(false);

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
      <div className="grid grid-cols-4 gap-2 lg:gap-3">
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
      aria-label="Add pieces"
      className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-cute-l border border-cute-border bg-cute-surface"
    >
      <div className="flex shrink-0 flex-col gap-1.5 px-3 pt-2.5 pb-2 lg:gap-2.5 lg:px-4 lg:pt-4 lg:pb-3">
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
                className="min-w-0 flex-1 bg-transparent font-body text-base text-cute-text outline-none placeholder:text-cute-text-muted sm:text-sm"
              />
            </label>
            {queryActive && (
              <p className="font-body text-[11px] font-semibold text-cute-text-muted">
                Showing results from all groups
              </p>
            )}

            {/* Below lg (picker docked under the canvas, little height to
                spare) subcategory and tag chips share one horizontally
                scrolling row; from lg each gets its own row. */}
            <div className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 pb-0.5 lg:mx-0 lg:flex-col lg:items-stretch lg:gap-2 lg:overflow-visible lg:px-0 lg:pb-0">
              {!queryActive && (
                <div className="flex shrink-0 gap-1.5 lg:-mx-4 lg:overflow-x-auto lg:px-4 lg:pb-0.5">
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
                <div className="flex shrink-0 items-center gap-1.5 lg:-mx-4 lg:flex-wrap lg:px-4 lg:pb-0.5">
                  <span className="shrink-0 pl-1 font-body text-[11px] font-bold text-cute-text-muted lg:pl-0">Tags</span>
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
                      expanded={moreTagsOpen}
                      onClick={() => setMoreTagsOpen((open) => !open)}
                    />
                  )}
                </div>
              )}
            </div>

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

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 lg:px-4 lg:pb-4"
        data-testid="picker-grid-scroller"
      >
        {body}
      </div>
    </section>
  );
}
