import type { LucideIcon } from "lucide-react";

interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  /** Visual shown above the heading. */
  icon: LucideIcon;
  heading: string;
  /** One-line supporting copy. */
  body: string;
  /** Optional primary call-to-action; omit when there's nothing useful to do. */
  action?: EmptyStateAction;
  className?: string;
}

/**
 * Shared empty/zero-data state: icon + heading + one-line body + optional
 * primary action. Used for "nothing here yet", "no results match", and
 * "no data of this kind exists" situations across the app so they share one
 * visual rhythm instead of each screen inventing its own gray `<p>`.
 */
export function EmptyState({ icon: Icon, heading, body, action, className }: EmptyStateProps) {
  return (
    <div
      className={`flex w-full flex-col items-center justify-center gap-3 px-6 py-12 text-center ${className ?? ""}`}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-cute-surface-alt text-cute-text-muted">
        <Icon size={26} />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-heading text-base font-semibold text-cute-text">{heading}</p>
        <p className="font-body text-sm text-cute-text-muted">{body}</p>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-1 flex items-center gap-1.5 rounded-full bg-cute-primary px-4 py-2.5 font-body text-sm font-medium text-cute-primary-foreground transition hover:brightness-105"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
