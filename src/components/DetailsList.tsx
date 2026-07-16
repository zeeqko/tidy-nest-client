import type { DetailRow } from "../types";

interface DetailsListProps {
  rows: DetailRow[];
}

export function DetailsList({ rows }: DetailsListProps) {
  return (
    <div className="flex w-full flex-col gap-1">
      <h3 className="font-heading text-[15px] font-semibold text-cute-text">Details</h3>
      <div className="flex w-full flex-col">
        {rows.map((row, index) => {
          const Icon = row.icon;
          return (
            <div
              key={row.label}
              className={`flex w-full items-center justify-between px-1 py-3 ${
                index < rows.length - 1 ? "border-b border-cute-border" : ""
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon size={16} className="text-cute-text-muted" />
                <span className="font-body text-sm text-cute-text-muted">{row.label}</span>
              </div>
              <span className="font-body text-sm font-semibold text-cute-text">
                {row.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
