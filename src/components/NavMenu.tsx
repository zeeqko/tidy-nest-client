import { useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { House, Boxes, Shapes, Settings2, Shirt } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { MODAL_Z_CLASS } from "./ModalShell";

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
  { id: "all-categories", label: "Browse Categories", icon: Shapes, to: "/categories" },
  { id: "style-book", label: "Style Book", icon: Shirt, to: "/stylebook" },
  { id: "manage-categories", label: "Edit Categories", icon: Settings2 },
];

/**
 * Two unrelated triggers can open this menu (the Home hamburger, top-left;
 * the mobile bottom nav's Menu tab, bottom-right), so on mobile it renders as
 * a bottom sheet — anchored to the tab bar itself rather than to whichever
 * trigger happened to open it — instead of a floating card with no visible
 * connection to either. Desktop only has the one (hamburger) trigger, so it
 * stays a dropdown anchored under it.
 */
export function NavMenu({ open, onClose, onManageCategories }: NavMenuProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const firstItemRef = useRef<HTMLButtonElement>(null);
  // Whichever element (hamburger or bottom-nav Menu tab) had focus right
  // before this opened — focus returns there on close, without either
  // trigger needing to know about the other.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    firstItemRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        className={`fixed inset-0 ${MODAL_Z_CLASS.base} bg-[#4A3F5555]`}
        onClick={onClose}
      />
      <div
        role="menu"
        aria-label="Main menu"
        className={`fixed inset-x-0 bottom-0 ${MODAL_Z_CLASS.raised} flex flex-col gap-0.5 rounded-t-cute-l border-t border-cute-border bg-cute-surface p-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_28px_-6px_rgba(74,63,85,0.19)] sm:inset-x-auto sm:top-[84px] sm:left-12 sm:bottom-auto sm:w-[240px] sm:rounded-cute-m sm:border sm:pb-2.5 sm:shadow-[0_12px_28px_-6px_rgba(74,63,85,0.19)]`}
      >
        {menuItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = item.to === location.pathname;
          return (
            <button
              key={item.id}
              ref={index === 0 ? firstItemRef : undefined}
              type="button"
              role="menuitem"
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
