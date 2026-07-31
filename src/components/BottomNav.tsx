import { House, Boxes, Plus, Shapes, Menu, type LucideIcon } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

interface BottomNavProps {
  onAddItem: () => void;
  onMenu: () => void;
  menuOpen?: boolean;
}

interface TabProps {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  onClick: () => void;
  ariaExpanded?: boolean;
  ariaHasPopup?: "menu";
}

function Tab({ label, icon: Icon, active, onClick, ariaExpanded, ariaHasPopup }: TabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      className={`flex flex-1 flex-col items-center gap-[3px] py-1 font-body text-[11px] transition ${
        active ? "font-semibold text-cute-primary" : "text-cute-text-muted"
      }`}
    >
      <Icon size={22} />
      {label}
    </button>
  );
}

/** Mobile-only bottom navigation (per the mobile designs in UI.pen). */
export function BottomNav({ onAddItem, onMenu, menuOpen }: BottomNavProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-cute-border bg-cute-surface px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:hidden">
      <Tab label="Home" icon={House} active={pathname === "/"} onClick={() => navigate("/")} />
      <Tab
        label="Items"
        icon={Boxes}
        active={pathname === "/items"}
        onClick={() => navigate("/items")}
      />
      <button
        type="button"
        onClick={onAddItem}
        aria-label="Add item"
        className="mx-2 -mt-6 flex h-13 w-13 shrink-0 items-center justify-center rounded-full bg-cute-primary text-cute-primary-foreground shadow-[0_8px_20px_-4px_rgba(255,143,171,0.65)] transition hover:brightness-105"
      >
        <Plus size={24} />
      </button>
      <Tab
        label="Categories"
        icon={Shapes}
        active={pathname.startsWith("/categor")}
        onClick={() => navigate("/categories")}
      />
      <Tab
        label="Menu"
        icon={Menu}
        onClick={onMenu}
        ariaExpanded={menuOpen ?? false}
        ariaHasPopup="menu"
      />
    </nav>
  );
}
