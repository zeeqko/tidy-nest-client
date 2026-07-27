import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface MobileTopBarProps {
  title: string;
  /** Where the back button goes; falls back to browser history. */
  backTo?: string;
  /** Optional element rendered at the right edge (e.g. an add button). */
  action?: ReactNode;
}

/** Mobile-only page top bar: back button + title (per the mobile designs in UI.pen). */
export function MobileTopBar({ title, backTo, action }: MobileTopBarProps) {
  const navigate = useNavigate();

  return (
    <div className="flex w-full items-center gap-3.5 px-5 pt-5 pb-3 sm:hidden">
      <button
        type="button"
        aria-label="Go back"
        onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cute-surface-alt text-cute-text transition hover:brightness-95"
      >
        <ChevronLeft size={18} />
      </button>
      <h1 className="min-w-0 flex-1 truncate font-heading text-xl font-semibold text-cute-text">
        {title}
      </h1>
      {action}
    </div>
  );
}
