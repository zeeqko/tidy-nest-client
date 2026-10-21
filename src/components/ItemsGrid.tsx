import { SearchX } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { ItemCard } from "./ItemCard";
import { ITEM_GRID } from "./itemGridClass";
import type { OrganizingItem } from "../types";

interface ItemsGridProps {
  items: OrganizingItem[];
  onSelect?: (item: OrganizingItem) => void;
  /** When provided, the no-matches state offers a "Clear filters" action. */
  onClearFilters?: () => void;
}

/** Same card everywhere an item list renders: the 4:5 photo card in a dense
 *  gallery grid: 3 columns below sm, 4 from sm, 5 from xl, capped at 1100px. */
export function ItemsGrid({ items, onSelect, onClearFilters }: ItemsGridProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        heading="No items match your search"
        body="Try a different search term, or clear your filters to see everything."
        action={onClearFilters ? { label: "Clear filters", onClick: onClearFilters } : undefined}
      />
    );
  }

  return (
    <div className={`${ITEM_GRID}`}>
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          density="full"
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
