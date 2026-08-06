import { useMemo, useState } from "react";
import { PackageSearch } from "lucide-react";
import { CategoryBadge } from "./CategoryBadge";
import { FilterPill } from "./FilterPill";
import { EmptyState } from "./EmptyState";
import { useCategories } from "../hooks/useCategories";
import { useItems } from "../hooks/useItems";
import { allCategory } from "../data/categories";
import type { OrganizingItem } from "../types";

interface OutfitItemPickerProps {
  /** Tapping a picker item appends it to the look-in-progress. */
  onAdd: (item: OrganizingItem) => void;
}

function PickerTile({ item, onAdd }: { item: OrganizingItem; onAdd: (item: OrganizingItem) => void }) {
  const Icon = item.icon;
  const src = item.cutoutURL || item.imageURL;
  return (
    <button
      type="button"
      onClick={() => onAdd(item)}
      className="flex w-[104px] shrink-0 flex-col gap-1.5 rounded-cute-l border border-cute-border bg-cute-surface p-2 text-left transition hover:shadow-[0_6px_14px_rgba(74,63,85,0.12)] sm:w-[124px]"
    >
      <div className="relative h-20 w-full shrink-0 overflow-hidden rounded-cute-m">
        {src ? (
          <img
            src={src}
            alt=""
            className={`h-full w-full ${item.cutoutURL ? "object-contain" : "object-cover"}`}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ backgroundColor: item.iconBg }}
          >
            <Icon size={28} color={item.iconColor} />
          </div>
        )}
      </div>
      <p className="truncate font-body text-xs font-medium text-cute-text">{item.name}</p>
    </button>
  );
}

/** Category tabs + item grid for the Outfit Builder, reusing the same
 *  categories/items fetch as the rest of the app (open questions 1-2: every
 *  top-level category is offered, "All" first, no wearable-only allowlist).
 *  Mobile renders a horizontally-scrolling strip; desktop wraps into a grid. */
export function OutfitItemPicker({ onAdd }: OutfitItemPickerProps) {
  const { categories, apiCategories } = useCategories();
  const { items, loading, error } = useItems(apiCategories);
  const [activeCategory, setActiveCategory] = useState("all");

  const activeCategoryLabel = categories.find((category) => category.id === activeCategory)?.label;

  const filteredItems = useMemo(() => {
    if (activeCategory === "all") return items;
    return items.filter((item) => item.category.label === activeCategoryLabel);
  }, [items, activeCategory, activeCategoryLabel]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <h2 className="font-heading text-sm font-semibold text-cute-text sm:text-base">Add a Piece</h2>

      <div className="flex w-full flex-wrap items-center gap-2.5">
        {[allCategory, ...categories].map((category) => (
          <FilterPill
            key={category.id}
            label={category.label}
            active={category.id === activeCategory}
            onClick={() => setActiveCategory(category.id)}
            icon={
              (category.iconSrc || category.iconName || category.colour) && (
                <CategoryBadge
                  iconSrc={category.iconSrc}
                  iconName={category.iconName}
                  colour={category.colour}
                  size={22}
                />
              )
            }
          />
        ))}
      </div>

      {error ? (
        <p className="w-full py-8 text-center font-body text-sm text-cute-danger">
          Couldn't load your closet: {error}
        </p>
      ) : loading ? (
        <p className="w-full py-8 text-center font-body text-sm text-cute-text-muted">
          Loading your closet…
        </p>
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          heading="No pieces here yet"
          body="Add items to your closet, or try a different category."
        />
      ) : (
        <div className="flex w-full gap-3 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
          {filteredItems.map((item) => (
            <PickerTile key={item.id} item={item} onAdd={onAdd} />
          ))}
        </div>
      )}
    </div>
  );
}
