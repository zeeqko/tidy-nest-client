import type { LucideIcon } from "lucide-react";
import { House, Boxes, Shapes, Settings2, Settings } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

interface NavMenuProps {
  open: boolean;
  onClose: () => void;
  onManageCategories?: () => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  to?: string;
}

const menuItems: MenuItem[] = [
  { id: "home", label: "Home", icon: House, to: "/" },
  { id: "all-items", label: "All Items", icon: Boxes, to: "/items" },
  { id: "all-categories", label: "All Categories", icon: Shapes, to: "/categories" },
  { id: "manage-categories", label: "Manage Categories", icon: Settings2 },
  { id: "settings", label: "Settings", icon: Settings },
];

export function NavMenu({ open, onClose, onManageCategories }: NavMenuProps) {
  const navigate = useNavigate();
  const location = useLocation();

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-5 z-40 flex w-[240px] flex-col gap-0.5 rounded-cute-m border border-cute-border bg-cute-surface p-2.5 shadow-[0_12px_28px_-6px_rgba(74,63,85,0.19)] sm:top-[84px] sm:bottom-auto sm:left-12">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.to === location.pathname;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.to) navigate(item.to);
                else if (item.id === "manage-categories") onManageCategories?.();
                onClose();
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-[11px] font-body text-sm transition ${
                isActive
                  ? "bg-cute-surface-alt font-semibold text-cute-text"
                  : "text-cute-text-muted hover:bg-cute-surface-alt"
              }`}
            >
              <Icon size={17} className={isActive ? "text-cute-primary" : "text-cute-text-muted"} />
              {item.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
