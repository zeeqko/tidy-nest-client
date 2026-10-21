import { useMemo, useState } from "react";
import { Header } from "./Header";
import { MobileTopBar } from "./MobileTopBar";
import { SearchBar } from "./SearchBar";
import { CategoryFilters } from "./CategoryFilters";
import { SubcategoryFilters } from "./SubcategoryFilters";
import { ItemsGrid } from "./ItemsGrid";
import { ItemDetailModal } from "./ItemDetailModal";
import { AddItemChooser } from "./AddItemChooser";
import { BulkAddItemsModal } from "./BulkAddItemsModal";
import { ItemFormModal } from "./ItemFormModal";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { deleteItem } from "../api/inventory";
import { useItems } from "../hooks/useItems";
import { useCategories } from "../hooks/useCategories";
import { SortSelect } from "./SortSelect";
import { FilterSelect } from "./FilterSelect";
import { sortItems, type SortOrder } from "../lib/sortItems";
import type { OrganizingItem } from "../types";

export function AllItemsPage() {
  const { categories, apiCategories } = useCategories();
  const { items, loading, error, refresh } = useItems(apiCategories);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeSubcategory, setActiveSubcategory] = useState("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [selectedItem, setSelectedItem] = useState<OrganizingItem | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<OrganizingItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrganizingItem | null>(null);

  const handleSelectCategory = (id: string) => {
    setActiveCategory(id);
    setActiveSubcategory("all");
  };

  const openCreate = () => setChooserOpen(true);

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

  // The category's own definition (includes subcategories with no items).
  const subcategories = useMemo(
    () => categories.find((c) => c.id === activeCategory)?.subcategories ?? [],
    [categories, activeCategory],
  );

  // A subcategory that left scope (edited/deleted) is treated as "all".
  const effectiveSubcategory = subcategories.some((s) => s.id === activeSubcategory)
    ? activeSubcategory
    : "all";

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesCategory =
        activeCategory === "all" || item.categoryId === activeCategory;
      const matchesSubcategory =
        effectiveSubcategory === "all" || item.subCategoryId === effectiveSubcategory;
      const matchesSearch =
        query.length === 0 || item.name.toLowerCase().includes(query);
      return matchesCategory && matchesSubcategory && matchesSearch;
    });
  }, [items, search, activeCategory, effectiveSubcategory]);

  const sortedItems = useMemo(
    () => sortItems(filteredItems, sortOrder),
    [filteredItems, sortOrder],
  );

  const hasActiveFilters =
    search.trim().length > 0 || activeCategory !== "all" || effectiveSubcategory !== "all";

  const clearFilters = () => {
    setSearch("");
    setActiveCategory("all");
    setActiveSubcategory("all");
  };

  const showSort = !error && !loading && sortedItems.length > 0;

  return (
    <div className="w-full px-5 pt-2 pb-10 sm:px-10">
      <div className="mx-auto flex w-full max-w-cute-page 2xl:max-w-cute-page-wide flex-col gap-4 sm:gap-9">
        <MobileTopBar title="All Items" backTo="/" />
        <div className="hidden sm:block">
          <Header totalCount={items.length} onAdd={openCreate} />
        </div>
        <SearchBar value={search} onChange={setSearch} />
        <div className="hidden sm:block">
          <CategoryFilters
            categories={categories}
            active={activeCategory}
            onSelect={handleSelectCategory}
          />
        </div>
        {subcategories.length > 0 && (
          <div className="hidden sm:block">
            <SubcategoryFilters
              subcategories={subcategories}
              active={effectiveSubcategory}
              onSelect={setActiveSubcategory}
            />
          </div>
        )}
        <div
          className={`flex w-full flex-wrap gap-2 sm:max-w-[1100px] sm:justify-end sm:gap-0 ${
            showSort ? "sm:-mb-6" : "sm:hidden"
          }`}
        >
          <FilterSelect
            className="flex-1 basis-[6.5rem] sm:hidden"
            label="Filter by category"
            value={activeCategory}
            options={[
              { value: "all", label: "All categories" },
              ...categories.map((c) => ({ value: c.id, label: c.label })),
            ]}
            onChange={handleSelectCategory}
          />
          <FilterSelect
            className="flex-1 basis-[6.5rem] sm:hidden"
            label="Filter by subcategory"
            value={effectiveSubcategory}
            options={
              subcategories.length > 0
                ? [
                    { value: "all", label: "All subcategories" },
                    ...subcategories.map((s) => ({ value: s.id, label: s.name })),
                  ]
                : [{ value: "all", label: "No subcategories" }]
            }
            onChange={setActiveSubcategory}
            disabled={subcategories.length === 0}
          />
          <SortSelect
            className={`flex-1 basis-[6.5rem] sm:flex-none sm:basis-auto ${showSort ? "" : "sm:hidden"}`}
            value={sortOrder}
            onChange={setSortOrder}
          />
        </div>
        {error ? (
          <p className="w-full py-10 text-center font-body text-sm text-cute-danger">
            Couldn't load items from the server: {error}
          </p>
        ) : loading ? (
          <p className="w-full py-10 text-center font-body text-sm text-cute-text-muted">
            Loading items…
          </p>
        ) : (
          <ItemsGrid
            items={sortedItems}
            onSelect={setSelectedItem}
            onClearFilters={hasActiveFilters ? clearFilters : undefined}
          />
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
      {chooserOpen && (
        <AddItemChooser
          onClose={() => setChooserOpen(false)}
          onChooseSingle={() => {
            setChooserOpen(false);
            setEditingItem(null);
            setFormOpen(true);
          }}
          onChooseBulk={() => {
            setChooserOpen(false);
            setBulkOpen(true);
          }}
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
      {bulkOpen && (
        <BulkAddItemsModal
          apiCategories={apiCategories}
          onClose={() => setBulkOpen(false)}
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
