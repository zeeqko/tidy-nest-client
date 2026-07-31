import { useMemo, useState } from "react";
import { SearchX } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { CategoryTile } from "./CategoryTile";
import { EmptyState } from "./EmptyState";
import { ItemCard } from "./ItemCard";
import { SearchBar } from "./SearchBar";
import { getCategoryStats } from "../data/categoryStats";
import { useItems } from "../hooks/useItems";
import { useCategories } from "../hooks/useCategories";
import { useCurrentUser } from "./RequireAuth";

export function HomePage() {
  const user = useCurrentUser();
  const firstName = user.name.trim().split(/\s+/)[0];
  const navigate = useNavigate();
  const { categories, apiCategories, loading } = useCategories();
  const { items, error } = useItems(apiCategories);
  const [search, setSearch] = useState("");
  const categoryStats = useMemo(
    () => getCategoryStats(categories, items),
    [categories, items],
  );

  const query = search.trim().toLowerCase();
  const shownCategories = query
    ? categoryStats.filter((category) => category.label.toLowerCase().includes(query))
    : categoryStats;
  // Search matches items by name too — not just category labels — so typing
  // an item's name (e.g. "milk") surfaces it directly on Home instead of the
  // "no results" state, even when no category label matches.
  const matchedItems = query
    ? items.filter((item) => item.name.toLowerCase().includes(query))
    : [];
  const noSearchResults = query.length > 0 && shownCategories.length === 0 && matchedItems.length === 0;
  const noCategoriesAtAll = !loading && categoryStats.length === 0 && query.length === 0;
  const showEmptyState = !loading && (noSearchResults || noCategoriesAtAll);

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

        {matchedItems.length > 0 && (
          <div className="flex w-full flex-col gap-3 sm:hidden">
            <p className="font-heading text-base font-semibold text-cute-text">
              Items matching "{query}"
            </p>
            <div className="flex w-full flex-col gap-2.5">
              {matchedItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  density="compact"
                  onSelect={(selected) => {
                    if (selected.categoryId) navigate(`/category/${selected.categoryId}`);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex w-full items-center justify-between sm:hidden">
          <p className="font-heading text-base font-semibold text-cute-text">Your Categories</p>
          <p className="font-body text-xs text-cute-text-muted">Tap to explore</p>
        </div>

        {(shownCategories.length > 0 || showEmptyState) && (
          <div className="flex w-full flex-col gap-3 sm:grid sm:grid-cols-2 sm:gap-7 lg:grid-cols-3">
            {shownCategories.map((category) => (
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
            {showEmptyState && (
              <EmptyState
                className="sm:col-span-2 lg:col-span-3"
                icon={SearchX}
                heading={noSearchResults ? "Nothing matches your search" : "No categories yet"}
                body={
                  noSearchResults
                    ? `We couldn't find anything for "${search.trim()}".`
                    : "You don't have any categories yet."
                }
                action={
                  noSearchResults ? { label: "Clear search", onClick: () => setSearch("") } : undefined
                }
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
