import { allCategory } from "../data/categories";
import type { Category } from "../types";
import { CategoryBadge } from "./CategoryBadge";
import { FilterPill } from "./FilterPill";

interface CategoryFiltersProps {
  categories: Category[];
  active: string;
  onSelect: (id: string) => void;
}

export function CategoryFilters({ categories, active, onSelect }: CategoryFiltersProps) {
  return (
    <div className="flex w-full flex-wrap items-center gap-2.5">
      {[allCategory, ...categories].map((category) => (
        <FilterPill
          key={category.id}
          label={category.label}
          active={category.id === active}
          onClick={() => onSelect(category.id)}
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
  );
}
