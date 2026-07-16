import type { ReactNode } from "react";

interface FilterPillProps {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
}

export function FilterPill({ label, active, onClick, icon }: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "flex items-center gap-2 rounded-full bg-cute-primary px-[18px] py-[9px] font-body text-[13px] font-semibold text-cute-primary-foreground transition"
          : `flex items-center gap-2 rounded-full border border-cute-border bg-cute-surface font-body text-[13px] text-cute-text transition hover:bg-cute-surface-alt ${
              icon ? "py-1.5 pr-4 pl-1.5" : "px-[18px] py-[9px]"
            }`
      }
    >
      {icon}
      {label}
    </button>
  );
}
