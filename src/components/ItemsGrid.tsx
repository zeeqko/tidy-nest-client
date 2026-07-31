import { SearchX } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { ItemCard } from "./ItemCard";
import type { OrganizingItem } from "../types";

interface ItemsGridProps {
  items: OrganizingItem[];
  onSelect?: (item: OrganizingItem) => void;
  /** When provided, the no-matches state offers a "Clear filters" action. */
  onClearFilters?: () => void;
}

/** Same card everywhere an item list renders: a single-column row layout on
 *  mobile (mirroring the Home category list), the large photo card at sm+.
 *  Edit/delete live in the detail modal here, so the card itself only needs
 *  onSelect. */
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
    <>
      {/* Mobile: single-column row cards, like the Home category list. */}
      <div className="flex w-full flex-col gap-2.5 sm:hidden">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} density="compact" onSelect={onSelect} />
        ))}
      </div>
      {/* Desktop: large photo cards from the Category Modal design. */}
      <div className="hidden w-full grid-cols-3 gap-6 sm:grid md:grid-cols-4 xl:grid-cols-5">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} density="full" onSelect={onSelect} />
        ))}
      </div>
    </>
  );
}
