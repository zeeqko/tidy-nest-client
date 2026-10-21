import { ChevronDown } from "lucide-react";

export interface FilterSelectOption {
  value: string;
  label: string;
}

interface FilterSelectProps {
  /** Accessible name (aria-label). */
  label: string;
  value: string;
  options: FilterSelectOption[];
  onChange: (value: string) => void;
  className?: string;
  /** Greyed, non-interactive; never rendered with the active look. */
  disabled?: boolean;
}

/** Native select styled as a FilterPill; active (value !== "all") uses the primary pill look. */
export function FilterSelect({ label, value, options, onChange, className = "", disabled = false }: FilterSelectProps) {
  const active = !disabled && value !== "all";
  return (
    <div className={`relative inline-block min-w-0 ${className}`}>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`min-h-11 w-full min-w-0 appearance-none ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"} truncate rounded-full py-2 pr-8 pl-3 font-body text-base shadow-[0_1px_3.5px_-1px_rgba(0,0,0,0.06)] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cute-primary sm:min-h-0 sm:pr-10 sm:pl-4 sm:text-xs ${
          active
            ? "bg-cute-primary font-semibold text-cute-primary-foreground"
            : `border border-cute-border bg-cute-surface font-medium text-cute-text ${disabled ? "" : "hover:bg-cute-surface-alt"}`
        }`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={15}
        aria-hidden="true"
        className={`pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 sm:right-4 ${
          active ? "text-cute-primary-foreground" : "text-cute-text-muted"
        } ${disabled ? "opacity-60" : ""}`}
      />
    </div>
  );
}
