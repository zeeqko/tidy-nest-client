import type { ReactNode } from "react";

interface FilterPillProps {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
  /** "md" = category-page subcategory tabs; "sm" = All Items filter chips. */
  size?: "md" | "sm";
}

export function FilterPill({ label, active, onClick, icon, size = "sm" }: FilterPillProps) {
  const shadow = "shadow-[0_1px_3.5px_-1px_rgba(0,0,0,0.06)]";
  const padding =
    size === "md"
      ? "px-6 py-2.5"
      : icon && !active
        ? "py-1.5 pr-3.5 pl-1.5"
        : "px-4 py-2";
  const text = size === "md" ? "text-sm" : "text-xs";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full font-body transition ${text} ${padding} ${shadow} ${
        active
          ? "bg-cute-primary font-semibold text-cute-primary-foreground"
          : "border border-cute-border bg-cute-surface font-medium text-cute-text hover:bg-cute-surface-alt"
      }`}
    >
      {!active && icon}
      {label}
    </button>
  );
}
