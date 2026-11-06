import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface MobileTopBarProps {
  title: string;
  /** Optional muted line under the title (e.g. a count). */
  subtitle?: string;
  /** Where the back button goes; falls back to browser history. */
  backTo?: string;
  /** Optional element rendered at the right edge (e.g. an add button). */
  action?: ReactNode;
  /** Drop the bar's own horizontal padding, for pages whose container
   *  already pads it (keeps the bar aligned with the content below). */
  flush?: boolean;
}

/** Mobile-only page top bar: back button + title (per the mobile designs in UI.pen). */
export function MobileTopBar({ title, subtitle, backTo, action, flush }: MobileTopBarProps) {
  const navigate = useNavigate();

  return (
    <div className={`flex w-full items-center gap-3.5 pt-5 pb-3 sm:hidden ${flush ? "" : "px-5"}`}>
      <button
        type="button"
        aria-label="Go back"
        onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cute-surface-alt text-cute-text transition hover:brightness-95"
      >
        <ChevronLeft size={18} />
      </button>
      {subtitle === undefined ? (
        <h1 className="min-w-0 flex-1 truncate font-heading text-xl font-semibold text-cute-text">
          {title}
        </h1>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate font-heading text-xl font-semibold text-cute-text">{title}</h1>
          <p className="truncate font-body text-xs font-medium text-cute-text-muted">{subtitle}</p>
        </div>
      )}
      {action}
    </div>
  );
}
