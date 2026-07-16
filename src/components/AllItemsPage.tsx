import { useMemo, useState } from "react";
import { Header } from "./Header";
import { SearchBar } from "./SearchBar";
import { CategoryFilters } from "./CategoryFilters";
import { SubcategoryFilters } from "./SubcategoryFilters";
import { ItemsGrid } from "./ItemsGrid";
import { ItemDetailModal } from "./ItemDetailModal";
import { categories } from "../data/categories";
import { useItems } from "../hooks/useItems";
import type { OrganizingItem } from "../types";

export function AllItemsPage() {
  const { items, loading, error } = useItems();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeSubcategory, setActiveSubcategory] = useState("all");
  const [selectedItem, setSelectedItem] = useState<OrganizingItem | null>(null);

  const activeCategoryLabel = categories.find((c) => c.id === activeCategory)?.label;

  const handleSelectCategory = (id: string) => {
    setActiveCategory(id);
    setActiveSubcategory("all");
  };

  const subcategories = useMemo(() => {
    if (activeCategory === "all") return [];
    const unique = new Set(
      items
        .filter((item) => item.category.label === activeCategoryLabel)
        .map((item) => item.subcategory),
    );
    return Array.from(unique);
  }, [items, activeCategory, activeCategoryLabel]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesCategory =
        activeCategory === "all" || item.category.label === activeCategoryLabel;
      const matchesSubcategory =
        activeSubcategory === "all" || item.subcategory === activeSubcategory;
      const matchesSearch =
        query.length === 0 || item.name.toLowerCase().includes(query);
      return matchesCategory && matchesSubcategory && matchesSearch;
    });
  }, [items, search, activeCategory, activeCategoryLabel, activeSubcategory]);

  return (
    <div className="min-h-screen w-full bg-cute-bg px-6 py-10 sm:px-10">
      <div className="mx-auto flex w-full max-w-[1300px] flex-col gap-6">
        <Header totalCount={items.length} />
        <SearchBar value={search} onChange={setSearch} />
        <CategoryFilters active={activeCategory} onSelect={handleSelectCategory} />
        <SubcategoryFilters
          subcategories={subcategories}
          active={activeSubcategory}
          onSelect={setActiveSubcategory}
        />
        {error ? (
          <p className="w-full py-10 text-center font-body text-sm text-cute-danger">
            Couldn't load items from the server: {error}
          </p>
        ) : loading ? (
          <p className="w-full py-10 text-center font-body text-sm text-cute-text-muted">
            Loading items…
          </p>
        ) : (
          <ItemsGrid items={filteredItems} onSelect={setSelectedItem} />
        )}
      </div>
      {selectedItem && (
        <ItemDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
}
