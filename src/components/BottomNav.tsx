import { House, Boxes, Plus, Shapes, Palette, type LucideIcon } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

interface BottomNavProps {
  onAddItem: () => void;
  onEditCategory: () => void;
  editCategoryActive?: boolean;
  /** Called when Home or Items is tapped, before navigating — lets the
   *  caller dismiss the Category panel even when the tap doesn't change the
   *  route (e.g. tapping Home while already on Home), which a route-change
   *  effect alone would miss. */
  onTabChange?: () => void;
}

interface TabProps {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  onClick: () => void;
  ariaExpanded?: boolean;
  ariaHasPopup?: "menu";
  disabled?: boolean;
}

function Tab({ label, icon: Icon, active, onClick, ariaExpanded, ariaHasPopup, disabled }: TabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Coming soon" : undefined}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      className={`flex flex-1 flex-col items-center gap-[3px] py-1 font-body text-[11px] transition ${
        disabled
          ? "cursor-not-allowed text-cute-text-muted opacity-40"
          : active
            ? "font-semibold text-cute-primary"
            : "text-cute-text-muted"
      }`}
    >
      <Icon size={22} />
      {label}
    </button>
  );
}

/** Mobile-only bottom navigation (per the mobile designs in UI.pen). */
export function BottomNav({
  onAddItem,
  onEditCategory,
  editCategoryActive,
  onTabChange,
}: BottomNavProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const goTo = (path: string) => {
    onTabChange?.();
    navigate(path);
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-cute-border bg-cute-surface px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:hidden">
      <Tab
        label="Home"
        icon={House}
        active={!editCategoryActive && pathname === "/"}
        onClick={() => goTo("/")}
      />
      <Tab
        label="Items"
        icon={Boxes}
        active={!editCategoryActive && pathname === "/items"}
        onClick={() => goTo("/items")}
      />
      <button
        type="button"
        onClick={onAddItem}
        aria-label="Add item"
        className="mx-2 -mt-6 flex h-13 w-13 shrink-0 items-center justify-center rounded-full bg-cute-primary text-cute-primary-foreground shadow-[0_8px_20px_-4px_rgba(255,143,171,0.65)] transition hover:brightness-105"
      >
        <Plus size={24} />
      </button>
      <Tab label="Category" icon={Shapes} active={editCategoryActive} onClick={onEditCategory} />
      <Tab
        label="Style Book"
        icon={Palette}
        active={!editCategoryActive && pathname === "/stylebook"}
        onClick={() => goTo("/stylebook")}
      />
    </nav>
  );
}
