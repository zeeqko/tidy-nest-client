import { SearchX } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { ItemCard } from "./ItemCard";
import type { OrganizingItem } from "../types";

interface ItemsGridProps {
  items: OrganizingItem[];
  onSelect?: (item: OrganizingItem) => void;
  /** When provided, the no-matches state offers a "Clear filters" action. */
  onClearFilters?: () => void;
  /** Inline edit/delete on the card itself, matching CategoryPage's grid. */
  onEdit?: (item: OrganizingItem) => void;
  onDelete?: (item: OrganizingItem) => void;
}

/** Same card everywhere an item list renders: the large photo card, 2-up on
 *  mobile for a shopping-app style browsing grid, scaling up to 5 columns
 *  at xl. */
export function ItemsGrid({ items, onSelect, onClearFilters, onEdit, onDelete }: ItemsGridProps) {
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
    <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-6 md:grid-cols-4 xl:grid-cols-5">
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          density="full"
          onSelect={onSelect}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
