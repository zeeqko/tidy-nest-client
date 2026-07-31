import { useMemo, useState } from "react";
import { Settings2, Plus, Boxes } from "lucide-react";
import { getCategoryStats } from "../data/categoryStats";
import { useItems } from "../hooks/useItems";
import { useCategories } from "../hooks/useCategories";
import { EmptyState } from "./EmptyState";
import { MobileTopBar } from "./MobileTopBar";
import { SearchBar } from "./SearchBar";
import { CategoryTile } from "./CategoryTile";
import { EditCategoryModal } from "./EditCategoryModal";
import { ManageCategoriesModal } from "./ManageCategoriesModal";

export function AllCategoriesPage() {
  const [search, setSearch] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const { categories, apiCategories, loading, refresh: refreshCategories } = useCategories();
  const { items, refresh } = useItems(apiCategories);
  const categoryStats = useMemo(
    () => getCategoryStats(categories, items),
    [categories, items],
  );

  const filteredCategories = categoryStats.filter((category) =>
    category.label.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="w-full px-5 pt-2 pb-10 sm:px-10">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 sm:gap-6">
        <MobileTopBar title="All Categories" backTo="/" />
        <div className="hidden w-full items-center justify-between sm:flex">
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-[26px] font-semibold text-cute-text">
              All Categories
            </h1>
            <p className="font-body text-sm text-cute-text-muted">
              Everything you own, organized by type
            </p>
          </div>
          <button
            type="button"
            onClick={() => setManageOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-cute-border px-4 py-2.5 font-body text-sm font-medium text-cute-text transition hover:bg-cute-surface-alt"
          >
            <Settings2 size={16} />
            Edit Categories
          </button>
        </div>

        <SearchBar value={search} onChange={setSearch} placeholder="Search categories..." />

        {!loading && categories.length === 0 ? (
          <EmptyState
            icon={Boxes}
            heading="No categories yet"
            body="Create a category to start organizing your things."
            action={{ label: "Add a category", onClick: () => setAddOpen(true) }}
          />
        ) : (
          <div className="flex w-full flex-col gap-3 sm:grid sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
            {filteredCategories.map((category) => (
              <CategoryTile
                key={category.id}
                to={`/category/${category.id}`}
                iconSrc={category.iconSrc}
                iconName={category.iconName}
                colour={category.colour}
                label={category.label}
                itemCount={category.itemCount}
                subcategories={category.subcategories}
              />
            ))}
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex items-center justify-center gap-2 rounded-cute-l border-[1.5px] border-cute-border p-4 text-center transition hover:bg-cute-surface-alt sm:flex-col sm:gap-3 sm:p-5"
            >
              <Plus size={18} className="text-cute-text sm:hidden" />
              <span className="hidden h-14 w-14 items-center justify-center rounded-full border border-cute-border bg-cute-surface text-cute-text sm:flex">
                <Plus size={24} />
              </span>
              <span className="font-body text-sm font-semibold text-cute-text">Add Category</span>
            </button>
          </div>
        )}
      </div>

      {manageOpen && (
        <ManageCategoriesModal
          onClose={(changes) => {
            setManageOpen(false);
            if (changes.items) refresh();
            if (changes.categories) refreshCategories();
          }}
        />
      )}
      {addOpen && (
        <EditCategoryModal
          onClose={() => setAddOpen(false)}
          onSaved={(changes) => {
            if (changes.items) refresh();
            if (changes.categories) refreshCategories();
          }}
        />
      )}
    </div>
  );
}
