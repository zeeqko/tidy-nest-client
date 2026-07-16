import { categories } from "../data/categories";
import { FilterPill } from "./FilterPill";

interface CategoryFiltersProps {
  active: string;
  onSelect: (id: string) => void;
}

export function CategoryFilters({ active, onSelect }: CategoryFiltersProps) {
  return (
    <div className="flex w-full flex-wrap items-center gap-2.5">
      {categories.map((category) => (
        <FilterPill
          key={category.id}
          label={category.label}
          active={category.id === active}
          onClick={() => onSelect(category.id)}
          icon={
            category.iconSrc && (
              <img
                src={category.iconSrc}
                alt=""
                className="h-[22px] w-[22px] rounded-full object-cover"
              />
            )
          }
        />
      ))}
    </div>
  );
}
