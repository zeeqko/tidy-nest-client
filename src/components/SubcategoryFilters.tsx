import { FilterPill } from "./FilterPill";

interface SubcategoryFiltersProps {
  subcategories: { id: string; name: string }[];
  active: string;
  onSelect: (value: string) => void;
}

export function SubcategoryFilters({
  subcategories,
  active,
  onSelect,
}: SubcategoryFiltersProps) {
  if (subcategories.length === 0) return null;

  return (
    <div className="flex w-full flex-wrap items-center gap-2.5">
      <FilterPill label="All" active={active === "all"} onClick={() => onSelect("all")} />
      {subcategories.map((subcategory) => (
        <FilterPill
          key={subcategory.id}
          label={subcategory.name}
          active={active === subcategory.id}
          onClick={() => onSelect(subcategory.id)}
        />
      ))}
    </div>
  );
}
