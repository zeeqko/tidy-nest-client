import type { DetailRow } from "../types";

interface DetailsListProps {
  rows: DetailRow[];
}

/**
 * Item-detail rows. Mobile: white bordered card with icon bubbles.
 * Desktop: borderless rows with plain muted icons (per UI.pen).
 */
export function DetailsList({ rows }: DetailsListProps) {
  return (
    <div className="flex w-full flex-col gap-1">
      <h3 className="font-heading text-[15px] font-semibold text-cute-text">Details</h3>
      <div className="flex w-full flex-col rounded-cute-m border border-cute-border bg-cute-surface px-4 py-1 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
        {rows.map((row, index) => {
          const Icon = row.icon;
          return (
            <div
              key={row.label}
              className={`flex w-full items-center justify-between gap-3 py-3.5 sm:px-1 sm:py-3 ${
                index < rows.length - 1 ? "border-b border-cute-border" : ""
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cute-surface-alt text-cute-secondary-foreground sm:h-auto sm:w-auto sm:bg-transparent sm:text-cute-text-muted">
                  <Icon size={16} />
                </span>
                <span className="truncate font-body text-[13px] text-cute-text-muted sm:text-sm">
                  {row.label}
                </span>
              </div>
              <span className="text-right font-body text-[13px] font-semibold text-cute-text sm:text-sm">
                {row.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
