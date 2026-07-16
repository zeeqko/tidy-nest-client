import { useMemo, useState } from "react";
import { Settings2, Plus } from "lucide-react";
import { getCategoryStats } from "../data/categoryStats";
import { useItems } from "../hooks/useItems";
import { SearchBar } from "./SearchBar";
import { CategoryTile } from "./CategoryTile";
import { ManageCategoriesModal } from "./ManageCategoriesModal";

export function AllCategoriesPage() {
  const [search, setSearch] = useState("");
  const [manageOpen, setManageOpen] = useState(false);

  const { items } = useItems();
  const categoryStats = useMemo(() => getCategoryStats(items), [items]);

  const filteredCategories = categoryStats.filter((category) =>
    category.label.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="min-h-screen w-full bg-cute-bg px-6 py-10 sm:px-10">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6">
        <div className="flex w-full items-center justify-between">
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
            Manage Categories
          </button>
        </div>

        <SearchBar value={search} onChange={setSearch} placeholder="Search categories..." />

        <div className="grid w-full grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {filteredCategories.map((category) => (
            <CategoryTile
              key={category.id}
              to={`/category/${category.id}`}
              iconSrc={category.iconSrc}
              label={category.label}
              itemCount={category.itemCount}
              subcategorySummary={category.subcategories.join(", ")}
            />
          ))}
          <button
            type="button"
            className="flex flex-col items-center justify-center gap-3 rounded-cute-l border-[1.5px] border-cute-border p-5 text-center transition hover:bg-cute-surface-alt"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-cute-border bg-cute-surface text-cute-text">
              <Plus size={24} />
            </span>
            <span className="font-body text-sm font-semibold text-cute-text">Add Category</span>
          </button>
        </div>
      </div>

      {manageOpen && <ManageCategoriesModal onClose={() => setManageOpen(false)} />}
    </div>
  );
}
