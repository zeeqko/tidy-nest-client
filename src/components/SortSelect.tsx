import { ChevronDown } from "lucide-react";
import { SORT_OPTIONS, type SortOrder } from "../lib/sortItems";

interface SortSelectProps {
  value: SortOrder;
  onChange: (value: SortOrder) => void;
  className?: string;
}

/** Native select (keyboard + mobile friendly) styled as a FilterPill. */
export function SortSelect({ value, onChange, className = "" }: SortSelectProps) {
  return (
    <div className={`relative inline-block ${className}`}>
      <select
        aria-label="Sort items"
        value={value}
        onChange={(e) => onChange(e.target.value as SortOrder)}
        className="min-h-11 w-full min-w-0 cursor-pointer appearance-none rounded-full border border-cute-border bg-cute-surface py-2 pr-10 pl-4 font-body text-base font-medium text-cute-text shadow-[0_1px_3.5px_-1px_rgba(0,0,0,0.06)] transition hover:bg-cute-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cute-primary sm:min-h-0 sm:text-xs"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-cute-text-muted"
      />
    </div>
  );
}
