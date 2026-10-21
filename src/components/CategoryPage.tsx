import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Settings2, Plus, Filter, PackageOpen } from "lucide-react";
import { deleteItem } from "../api/inventory";
import { useItems } from "../hooks/useItems";
import { useCategories } from "../hooks/useCategories";
import { CategoryBadge } from "./CategoryBadge";
import { EmptyState } from "./EmptyState";
import { FilterPill } from "./FilterPill";
import { MobileTopBar } from "./MobileTopBar";
import { ItemCard } from "./ItemCard";
import { ITEM_GRID_BASE } from "./itemGridClass";
import { ItemDetailModal } from "./ItemDetailModal";
import { AddItemChooser } from "./AddItemChooser";
import { BulkAddItemsModal } from "./BulkAddItemsModal";
import { ItemFormModal } from "./ItemFormModal";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { ManageCategoriesModal } from "./ManageCategoriesModal";
import { SortSelect } from "./SortSelect";
import { FilterSelect } from "./FilterSelect";
import { TagFilters } from "./TagFilters";
import { aggregateTags } from "../lib/aggregateTags";
import { sortItems, type SortOrder } from "../lib/sortItems";
import type { OrganizingItem } from "../types";

export function CategoryPage() {
  const { categoryId } = useParams<{ categoryId: string }>();

  const {
    categories,
    apiCategories,
    loading: categoriesLoading,
    refresh: refreshCategories,
  } = useCategories();
  const { items, loading, error, refresh } = useItems(apiCategories);
  const category = categories.find((c) => c.id === categoryId);

  const [activeSubcategory, setActiveSubcategory] = useState("all");
  const [activeTag, setActiveTag] = useState("all");
  // Reset filters during render when the route switches category (same component
  // instance is reused), so no stale filter is ever painted. Sort is kept (D15).
  const [prevCategoryId, setPrevCategoryId] = useState(categoryId);
  if (prevCategoryId !== categoryId) {
    setPrevCategoryId(categoryId);
    setActiveSubcategory("all");
    setActiveTag("all");
  }
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [selectedItem, setSelectedItem] = useState<OrganizingItem | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<OrganizingItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrganizingItem | null>(null);

  const openAddChooser = () => setChooserOpen(true);

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

  const categoryItems = useMemo(
    () => items.filter((item) => item.categoryId === category?.id),
    [items, category],
  );

  // Derived from the category's own subcategory list (not from items present)
  // so subcategories with zero items still show up in tile subtitles and
  // filter pills.
  const subcategories = category?.subcategories ?? [];

  const tags = useMemo(() => aggregateTags(categoryItems), [categoryItems]);

  // Derived so a stale id/label (item edited/deleted) never filters or mis-highlights.
  const effectiveSubcategory = subcategories.some((s) => s.id === activeSubcategory)
    ? activeSubcategory
    : "all";
  const effectiveTag =
    activeTag === "all" || tags.some((t) => t.label === activeTag) ? activeTag : "all";

  const filteredItems = useMemo(
    () =>
      categoryItems.filter((item) => {
        const matchesSubcategory =
          effectiveSubcategory === "all" || item.subCategoryId === effectiveSubcategory;
        const matchesTag =
          effectiveTag === "all" || item.tags.some((tag) => tag.label === effectiveTag);
        return matchesSubcategory && matchesTag;
      }),
    [categoryItems, effectiveSubcategory, effectiveTag],
  );

  const sortedItems = useMemo(
    () => sortItems(filteredItems, sortOrder),
    [filteredItems, sortOrder],
  );

  if (!category) {
    if (categoriesLoading) {
      return (
        <div className="flex min-h-[60dvh] w-full items-center justify-center">
          <p className="font-body text-sm text-cute-text-muted">Loading…</p>
        </div>
      );
    }
    return (
      <div className="flex min-h-[60dvh] w-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-heading text-xl font-semibold text-cute-text">Category not found</p>
        <Link
          to="/categories"
          className="font-body text-sm font-semibold text-cute-primary hover:underline"
        >
          Back to Categories
        </Link>
      </div>
    );
  }

  const showSort = !error && !loading && sortedItems.length > 0;

  return (
    <div className="w-full px-5 pt-2 pb-10 sm:px-10">
      <div className="mx-auto flex w-full max-w-cute-page 2xl:max-w-cute-page-wide flex-col gap-5 sm:gap-7">
        <MobileTopBar title={category.label} backTo="/categories" />
        <div className="flex w-full items-center gap-3.5 sm:hidden">
          <CategoryBadge
            iconSrc={category.iconSrc}
            iconName={category.iconName}
            colour={category.colour}
            size={46}
          />
          <p className="min-w-0 flex-1 truncate font-body text-sm text-cute-text-muted">
            {categoryItems.length} {categoryItems.length === 1 ? "item" : "items"}
          </p>
        </div>
        <div className="hidden w-full flex-wrap items-center justify-between gap-4 sm:flex">
          <div className="flex items-center gap-4">
            <CategoryBadge
              iconSrc={category.iconSrc}
              iconName={category.iconName}
              colour={category.colour}
              size={62}
            />
            <div className="flex flex-col gap-0.5">
              <h1 className="font-heading text-cute-fluid-28 font-semibold text-cute-text">
                {category.label}
              </h1>
              <p className="font-body text-sm text-cute-text-muted">
                {categoryItems.length} {categoryItems.length === 1 ? "item" : "items"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setManageOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-cute-border px-4 py-2.5 font-body text-sm font-medium text-cute-text transition hover:bg-cute-surface-alt"
            >
              <Settings2 size={16} />
              Edit Categories
            </button>
            <button
              type="button"
              onClick={openAddChooser}
              className="flex items-center gap-1.5 rounded-full bg-cute-primary px-4 py-2.5 font-body text-sm font-medium text-cute-primary-foreground transition hover:brightness-105"
            >
              <Plus size={16} />
              Add Item
            </button>
          </div>
        </div>

        {categoryItems.length > 0 && subcategories.length > 0 && (
          <div className="hidden w-full flex-wrap items-center gap-2.5 sm:flex">
            <FilterPill
              label="All"
              size="md"
              active={effectiveSubcategory === "all"}
              onClick={() => setActiveSubcategory("all")}
            />
            {subcategories.map((sub) => (
              <FilterPill
                key={sub.id}
                label={sub.name}
                size="md"
                active={effectiveSubcategory === sub.id}
                onClick={() => setActiveSubcategory(sub.id)}
              />
            ))}
          </div>
        )}

        {categoryItems.length > 0 && tags.length > 0 && (
          <div className="hidden sm:block">
            <TagFilters tags={tags} active={effectiveTag} onSelect={setActiveTag} />
          </div>
        )}

        <div
          className={`-mb-2 flex w-full flex-wrap gap-2 sm:-mb-4 sm:max-w-[1200px] sm:justify-end ${
            showSort ? "" : "sm:hidden"
          }`}
        >
          <FilterSelect
            label="Filter by subcategory"
            value={effectiveSubcategory}
            options={
              subcategories.length > 0
                ? [
                    { value: "all", label: "All subcategories" },
                    ...subcategories.map((sub) => ({ value: sub.id, label: sub.name })),
                  ]
                : [{ value: "all", label: "No subcategories" }]
            }
            onChange={setActiveSubcategory}
            disabled={subcategories.length === 0}
            className="flex-1 basis-[6.5rem] sm:hidden"
          />
          <FilterSelect
            label="Filter by tag"
            value={effectiveTag}
            options={
              tags.length > 0
                ? [
                    { value: "all", label: "All tags" },
                    ...tags.map((t) => ({ value: t.label, label: `${t.label} (${t.count})` })),
                  ]
                : [{ value: "all", label: "No tags" }]
            }
            onChange={setActiveTag}
            disabled={tags.length === 0}
            className="flex-1 basis-[6.5rem] sm:hidden"
          />
          <SortSelect
            value={sortOrder}
            onChange={setSortOrder}
            className={`flex-1 basis-[6.5rem] sm:flex-none ${showSort ? "" : "sm:hidden"}`}
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
        ) : categoryItems.length === 0 ? (
          <EmptyState
            icon={PackageOpen}
            heading="Nothing here yet"
            body={`Add your first item to start organizing ${category.label.toLowerCase()}.`}
            action={{
              label: "Add your first item",
              onClick: openAddChooser,
            }}
          />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon={Filter}
            heading="No items match these filters"
            body="Try a different subcategory or tag, or clear your filters to see everything."
            action={{
              label: "Clear filters",
              onClick: () => {
                setActiveSubcategory("all");
                setActiveTag("all");
              },
            }}
          />
        ) : (
          <div className={`${ITEM_GRID_BASE} max-w-[1200px]`}>
            {sortedItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                density="full"
                hideChip
                onSelect={setSelectedItem}
              />
            ))}
          </div>
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
      {deleteTarget && (
        <ConfirmDeleteModal
          title={`Delete "${deleteTarget.name}"?`}
          message="This removes the item from your inventory. This can't be undone."
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
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
          initialCategory={category.label}
          initialCategoryId={Number(category.id)}
          apiCategories={apiCategories}
          onClose={() => setFormOpen(false)}
          onSaved={refresh}
        />
      )}
      {bulkOpen && (
        <BulkAddItemsModal
          apiCategories={apiCategories}
          initialCategoryId={Number(category.id)}
          onClose={() => setBulkOpen(false)}
          onSaved={refresh}
        />
      )}
      {manageOpen && (
        <ManageCategoriesModal
          apiCategories={apiCategories}
          onChanged={refreshCategories}
          onClose={(changes) => {
            setManageOpen(false);
            if (changes.items) refresh();
          }}
        />
      )}
    </div>
  );
}
