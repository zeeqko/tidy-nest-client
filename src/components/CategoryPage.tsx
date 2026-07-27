import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Settings2, Plus } from "lucide-react";
import { deleteItem } from "../api/inventory";
import { useItems } from "../hooks/useItems";
import { useCategories } from "../hooks/useCategories";
import { CategoryBadge } from "./CategoryBadge";
import { FilterPill } from "./FilterPill";
import { MobileTopBar } from "./MobileTopBar";
import { ItemCard } from "./ItemCard";
import { CompactItemCard } from "./ItemsGrid";
import { ItemDetailModal } from "./ItemDetailModal";
import { ItemFormModal } from "./ItemFormModal";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { ManageCategoriesModal } from "./ManageCategoriesModal";
import type { OrganizingItem } from "../types";

export function CategoryPage() {
  const { categoryId } = useParams<{ categoryId: string }>();

  const { items, loading, error, refresh } = useItems();
  const {
    categories,
    apiCategories,
    loading: categoriesLoading,
    refresh: refreshCategories,
  } = useCategories();
  const category = categories.find((c) => c.id === categoryId);

  const [activeSubcategory, setActiveSubcategory] = useState("all");
  const [activeTag, setActiveTag] = useState("all");
  const [selectedItem, setSelectedItem] = useState<OrganizingItem | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<OrganizingItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrganizingItem | null>(null);

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
    () => items.filter((item) => item.category.label === category?.label),
    [items, category],
  );

  const subcategories = useMemo(
    () => Array.from(new Set(categoryItems.map((item) => item.subcategory))),
    [categoryItems],
  );

  const tags = useMemo(() => {
    const map = new Map<string, { label: string; bg: string; fg: string; count: number }>();
    for (const item of categoryItems) {
      for (const tag of item.tags) {
        const existing = map.get(tag.label);
        if (existing) existing.count += 1;
        else map.set(tag.label, { ...tag, count: 1 });
      }
    }
    return Array.from(map.values());
  }, [categoryItems]);

  const filteredItems = categoryItems.filter((item) => {
    const matchesSubcategory =
      activeSubcategory === "all" || item.subcategory === activeSubcategory;
    const matchesTag = activeTag === "all" || item.tags.some((tag) => tag.label === activeTag);
    return matchesSubcategory && matchesTag;
  });

  if (!category) {
    if (categoriesLoading) {
      return (
        <div className="flex min-h-[60vh] w-full items-center justify-center">
          <p className="font-body text-sm text-cute-text-muted">Loading…</p>
        </div>
      );
    }
    return (
      <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-heading text-xl font-semibold text-cute-text">Category not found</p>
        <Link
          to="/categories"
          className="font-body text-sm font-semibold text-cute-primary hover:underline"
        >
          Back to All Categories
        </Link>
      </div>
    );
  }

  const subcategorySummary = subcategories.slice(0, 3).join(", ");

  return (
    <div className="w-full px-5 pt-2 pb-10 sm:px-10">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 sm:gap-7">
        <MobileTopBar
          title={category.label}
          backTo="/categories"
          action={
            <button
              type="button"
              aria-label="Add item"
              onClick={() => {
                setEditingItem(null);
                setFormOpen(true);
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cute-primary text-cute-primary-foreground transition hover:brightness-105"
            >
              <Plus size={18} />
            </button>
          }
        />
        <div className="flex w-full items-center gap-3.5 sm:hidden">
          <CategoryBadge
            iconSrc={category.iconSrc}
            iconName={category.iconName}
            colour={category.colour}
            size={46}
          />
          <p className="min-w-0 flex-1 truncate font-body text-sm text-cute-text-muted">
            {categoryItems.length} {categoryItems.length === 1 ? "item" : "items"}
            {subcategorySummary ? ` · ${subcategorySummary}` : ""}
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
              <h1 className="font-heading text-[28px] font-semibold text-cute-text">
                {category.label}
              </h1>
              <p className="font-body text-sm text-cute-text-muted">
                {categoryItems.length} {categoryItems.length === 1 ? "item" : "items"}
                {subcategorySummary ? ` · ${subcategorySummary}` : ""}
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
              Manage Categories
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingItem(null);
                setFormOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-full bg-cute-primary px-4 py-2.5 font-body text-sm font-medium text-cute-primary-foreground transition hover:brightness-105"
            >
              <Plus size={16} />
              Add Item
            </button>
          </div>
        </div>

        {subcategories.length > 0 && (
          <div className="flex w-full flex-wrap items-center gap-2.5">
            <FilterPill
              label="All"
              size="md"
              active={activeSubcategory === "all"}
              onClick={() => setActiveSubcategory("all")}
            />
            {subcategories.map((sub) => (
              <FilterPill
                key={sub}
                label={sub}
                size="md"
                active={activeSubcategory === sub}
                onClick={() => setActiveSubcategory(sub)}
              />
            ))}
          </div>
        )}

        {tags.length > 0 && (
          <div className="flex w-full flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTag("all")}
              className={`rounded-full px-4 py-[7px] font-body text-xs font-semibold transition ${
                activeTag === "all"
                  ? "bg-cute-secondary text-cute-secondary-foreground"
                  : "border border-cute-border bg-cute-surface text-cute-text hover:bg-cute-surface-alt"
              }`}
            >
              All Tags
            </button>
            {tags.map((tag) => (
              <button
                key={tag.label}
                type="button"
                onClick={() => setActiveTag(tag.label)}
                className={`flex items-center gap-1.5 rounded-full border px-3.5 py-[7px] font-body text-xs transition ${
                  activeTag === tag.label
                    ? "border-cute-text bg-cute-surface-alt font-semibold text-cute-text"
                    : "border-cute-border bg-cute-surface text-cute-text hover:bg-cute-surface-alt"
                }`}
              >
                <span
                  className="h-[7px] w-[7px] rounded-full"
                  style={{ backgroundColor: tag.bg, border: `1px solid ${tag.fg}` }}
                />
                {tag.label} ({tag.count})
              </button>
            ))}
          </div>
        )}

        {error ? (
          <p className="w-full py-10 text-center font-body text-sm text-cute-danger">
            Couldn't load items from the server: {error}
          </p>
        ) : loading ? (
          <p className="w-full py-10 text-center font-body text-sm text-cute-text-muted">
            Loading items…
          </p>
        ) : filteredItems.length === 0 ? (
          <p className="w-full py-10 text-center font-body text-sm text-cute-text-muted">
            No items match these filters.
          </p>
        ) : (
          <>
            {/* Mobile: compact 3-per-row grid, like the All Items (Mobile) design. */}
            <div className="grid w-full grid-cols-3 gap-2.5 sm:hidden">
              {filteredItems.map((item) => (
                <CompactItemCard key={item.id} item={item} onSelect={setSelectedItem} />
              ))}
            </div>
            {/* Desktop: large photo cards from the Category Modal design. */}
            <div className="hidden w-full grid-cols-4 gap-6 sm:grid">
              {filteredItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  chipMode="subcategory"
                  onSelect={setSelectedItem}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          </>
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
      {formOpen && (
        <ItemFormModal
          item={editingItem ?? undefined}
          initialCategory={category.label}
          apiCategories={apiCategories}
          onClose={() => setFormOpen(false)}
          onSaved={refresh}
        />
      )}
      {manageOpen && (
        <ManageCategoriesModal
          onClose={(changes) => {
            setManageOpen(false);
            if (changes.items) refresh();
            if (changes.categories) refreshCategories();
          }}
        />
      )}
    </div>
  );
}
