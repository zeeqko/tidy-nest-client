import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { CategoryBadge } from "./CategoryBadge";
import { SearchBar } from "./SearchBar";
import { getCategoryStats } from "../data/categoryStats";
import { useItems } from "../hooks/useItems";
import { useCategories } from "../hooks/useCategories";
import { useCurrentUser } from "./RequireAuth";

function summarizeSubcategories(subcategories: string[]): string {
  const shown = subcategories.slice(0, 2).join(", ");
  const rest = subcategories.length - 2;
  return rest > 0 ? `${shown} +${rest}` : shown;
}

export function HomePage() {
  const user = useCurrentUser();
  const firstName = user.name.trim().split(/\s+/)[0];
  const { items, error } = useItems();
  const { categories } = useCategories();
  const [search, setSearch] = useState("");
  const categoryStats = useMemo(
    () => getCategoryStats(categories, items),
    [categories, items],
  );

  const shownCategories = categoryStats.filter((category) =>
    category.label.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="w-full px-5 pt-2 pb-10 sm:px-10">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 sm:gap-9">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-[22px] font-semibold text-cute-text sm:text-[30px]">
            Hi {firstName} 👋
          </h1>
          <p className="font-body text-[13px] text-cute-text-muted sm:text-[15px]">
            Here's what's tucked away at home
          </p>
          {error && (
            <p className="font-body text-sm text-cute-danger">
              Couldn't load items from the server: {error}
            </p>
          )}
        </div>

        <div className="sm:hidden">
          <SearchBar value={search} onChange={setSearch} placeholder="Search your stuff..." />
        </div>

        <div className="flex w-full items-center justify-between sm:hidden">
          <p className="font-heading text-base font-semibold text-cute-text">Your Spaces</p>
          <p className="font-body text-xs text-cute-text-muted">Tap to explore</p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:grid sm:grid-cols-2 sm:gap-7 lg:grid-cols-3">
          {shownCategories.map((category) => (
            <Link
              key={category.id}
              to={`/category/${category.id}`}
              className="flex items-center gap-3.5 rounded-cute-l border border-cute-border bg-cute-surface p-3 shadow-[0_3px_10px_-2px_rgba(74,63,85,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-4px_rgba(74,63,85,0.14)] sm:flex-col sm:gap-3.5 sm:p-8 sm:shadow-[0_8px_20px_-4px_rgba(74,63,85,0.08)]"
            >
              <span className="sm:hidden">
                <CategoryBadge
                  iconSrc={category.iconSrc}
                  iconName={category.iconName}
                  colour={category.colour}
                  size={64}
                />
              </span>
              <span className="hidden sm:block">
                <CategoryBadge
                  iconSrc={category.iconSrc}
                  iconName={category.iconName}
                  colour={category.colour}
                  size={110}
                />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-none sm:items-center sm:gap-[5px] sm:text-center">
                <p className="truncate font-heading text-base font-medium text-cute-text sm:text-[21px] sm:font-semibold">
                  {category.label}
                </p>
                <p className="font-body text-[13px] text-cute-text-muted sm:text-sm">
                  {category.itemCount} {category.itemCount === 1 ? "item" : "items"}
                </p>
                <p className="hidden font-body text-xs text-cute-text-muted sm:block">
                  {summarizeSubcategories(category.subcategories)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:hidden">
                {category.subcategories[0] && (
                  <span
                    className="rounded-full px-[11px] py-1 font-body text-[11px] font-semibold text-cute-text"
                    style={{ backgroundColor: category.colour ?? "#F5DCE8" }}
                  >
                    {category.subcategories[0]}
                  </span>
                )}
                <ChevronRight size={16} className="text-cute-text-muted" />
              </div>
            </Link>
          ))}
          {shownCategories.length === 0 && (
            <p className="w-full py-8 text-center font-body text-sm text-cute-text-muted">
              No spaces match your search.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
