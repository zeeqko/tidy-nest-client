import { useMemo, useState } from "react";
import { Header } from "./Header";
import { MobileTopBar } from "./MobileTopBar";
import { SearchBar } from "./SearchBar";
import { CategoryFilters } from "./CategoryFilters";
import { SubcategoryFilters } from "./SubcategoryFilters";
import { ItemsGrid } from "./ItemsGrid";
import { ItemDetailModal } from "./ItemDetailModal";
import { ItemFormModal } from "./ItemFormModal";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { deleteItem } from "../api/inventory";
import { useItems } from "../hooks/useItems";
import { useCategories } from "../hooks/useCategories";
import type { OrganizingItem } from "../types";

export function AllItemsPage() {
  const { items, loading, error, refresh } = useItems();
  const { categories, apiCategories } = useCategories();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeSubcategory, setActiveSubcategory] = useState("all");
  const [selectedItem, setSelectedItem] = useState<OrganizingItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<OrganizingItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrganizingItem | null>(null);

  const activeCategoryLabel = categories.find((c) => c.id === activeCategory)?.label;

  const handleSelectCategory = (id: string) => {
    setActiveCategory(id);
    setActiveSubcategory("all");
  };

  const openCreate = () => {
    setEditingItem(null);
    setFormOpen(true);
  };

  const openEdit = (item: OrganizingItem) => {
    setSelectedItem(null);
    setEditingItem(item);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteItem(deleteTarget.id);
    setDeleteTarget(null);
    setSelectedItem(null);
    await refresh();
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
    <div className="w-full px-5 pt-2 pb-10 sm:px-10">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 sm:gap-9">
        <MobileTopBar title="All Items" backTo="/" />
        <div className="hidden sm:block">
          <Header totalCount={items.length} onAdd={openCreate} />
        </div>
        <SearchBar value={search} onChange={setSearch} />
        <CategoryFilters
          categories={categories}
          active={activeCategory}
          onSelect={handleSelectCategory}
        />
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
        <ItemDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
        />
      )}
      {formOpen && (
        <ItemFormModal
          item={editingItem ?? undefined}
          apiCategories={apiCategories}
          onClose={() => setFormOpen(false)}
          onSaved={refresh}
        />
      )}
      {deleteTarget && (
        <ConfirmDeleteModal
          title={`Delete "${deleteTarget.name}"?`}
          message="This removes the item from your inventory. This can't be undone."
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
