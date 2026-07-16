import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Settings2, Plus } from "lucide-react";
import { categories } from "../data/categories";
import { useItems } from "../hooks/useItems";
import { FilterPill } from "./FilterPill";
import { ItemCard } from "./ItemCard";
import { ItemDetailModal } from "./ItemDetailModal";
import { ManageCategoriesModal } from "./ManageCategoriesModal";
import type { OrganizingItem } from "../types";

export function CategoryPage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const category = categories.find((c) => c.id === categoryId);

  const { items, loading, error } = useItems();
  const [activeSubcategory, setActiveSubcategory] = useState("all");
  const [activeTag, setActiveTag] = useState("all");
  const [selectedItem, setSelectedItem] = useState<OrganizingItem | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

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
      if (!item.tag) continue;
      const existing = map.get(item.tag.label);
      if (existing) existing.count += 1;
      else map.set(item.tag.label, { ...item.tag, count: 1 });
    }
    return Array.from(map.values());
  }, [categoryItems]);

  const filteredItems = categoryItems.filter((item) => {
    const matchesSubcategory =
      activeSubcategory === "all" || item.subcategory === activeSubcategory;
    const matchesTag = activeTag === "all" || item.tag?.label === activeTag;
    return matchesSubcategory && matchesTag;
  });

  if (!category) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-3 bg-cute-bg px-6 text-center">
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
    <div className="min-h-screen w-full bg-cute-bg px-6 py-10 sm:px-10">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-7">
        <div className="flex w-full flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {category.iconSrc && (
              <img
                src={category.iconSrc}
                alt=""
                className="h-[62px] w-[62px] rounded-full object-cover"
              />
            )}
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
              active={activeSubcategory === "all"}
              onClick={() => setActiveSubcategory("all")}
            />
            {subcategories.map((sub) => (
              <FilterPill
                key={sub}
                label={sub}
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
          <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {filteredItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                chipMode="subcategory"
                onSelect={setSelectedItem}
              />
            ))}
          </div>
        )}
      </div>

      {selectedItem && (
        <ItemDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
      {manageOpen && <ManageCategoriesModal onClose={() => setManageOpen(false)} />}
    </div>
  );
}
