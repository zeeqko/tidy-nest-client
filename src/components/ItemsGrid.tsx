import type { OrganizingItem } from "../types";
import { ItemCard } from "./ItemCard";

interface ItemsGridProps {
  items: OrganizingItem[];
  onSelect?: (item: OrganizingItem) => void;
  onEdit?: (item: OrganizingItem) => void;
  onDelete?: (item: OrganizingItem) => void;
}

export function ItemsGrid({ items, onSelect, onEdit, onDelete }: ItemsGridProps) {
  if (items.length === 0) {
    return (
      <p className="w-full py-12 text-center font-body text-sm text-cute-text-muted">
        No items match your search.
      </p>
    );
  }

  return (
    <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          onSelect={onSelect}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
