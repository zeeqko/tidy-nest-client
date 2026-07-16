import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HomeTopBar } from "./HomeTopBar";
import { NavMenu } from "./NavMenu";
import { ManageCategoriesModal } from "./ManageCategoriesModal";
import { getCategoryStats } from "../data/categoryStats";
import { useItems } from "../hooks/useItems";

function summarizeSubcategories(subcategories: string[]): string {
  const shown = subcategories.slice(0, 2).join(", ");
  const rest = subcategories.length - 2;
  return rest > 0 ? `${shown} +${rest}` : shown;
}

export function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const { items, error } = useItems();
  const categoryStats = useMemo(() => getCategoryStats(items), [items]);

  return (
    <div className="min-h-screen w-full bg-cute-bg">
      <HomeTopBar onMenuClick={() => setMenuOpen((open) => !open)} />
      <NavMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onManageCategories={() => setManageOpen(true)}
      />

      <div className="flex w-full flex-col gap-9 px-12 pt-2 pb-14">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-[30px] font-semibold text-cute-text">
            Hi Jamie 👋
          </h1>
          <p className="font-body text-[15px] text-cute-text-muted">
            Here's everything, all in one place
          </p>
          {error && (
            <p className="font-body text-sm text-cute-danger">
              Couldn't load items from the server: {error}
            </p>
          )}
        </div>

        <div className="grid w-full grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
          {categoryStats.map((category) => (
            <Link
              key={category.id}
              to={`/category/${category.id}`}
              className="flex flex-col items-center gap-3.5 rounded-cute-l border border-cute-border bg-cute-surface p-8 shadow-[0_8px_20px_-4px_rgba(74,63,85,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-4px_rgba(74,63,85,0.14)]"
            >
              {category.iconSrc && (
                <img
                  src={category.iconSrc}
                  alt=""
                  className="h-[110px] w-[110px] rounded-full object-cover"
                />
              )}
              <div className="flex flex-col items-center gap-[5px] text-center">
                <p className="font-heading text-[21px] font-semibold text-cute-text">
                  {category.label}
                </p>
                <p className="font-body text-sm text-cute-text-muted">
                  {category.itemCount} {category.itemCount === 1 ? "item" : "items"}
                </p>
                <p className="font-body text-xs text-cute-text-muted">
                  {summarizeSubcategories(category.subcategories)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {manageOpen && <ManageCategoriesModal onClose={() => setManageOpen(false)} />}
    </div>
  );
}
