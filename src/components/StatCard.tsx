import type { StatEntry } from "../types";

interface StatCardProps {
  stat: StatEntry;
  /** Colours for the mobile icon bubble (per the Item Detail (Mobile) design). */
  accent: { bg: string; fg: string };
}

/**
 * Item-detail stat tile. Mobile: white bordered card with a coloured icon
 * bubble, value, label. Desktop: soft surface-alt card with an icon+label
 * head row, value, helper (per the two Item Detail designs in UI.pen).
 */
export function StatCard({ stat, accent }: StatCardProps) {
  const Icon = stat.icon;

  return (
    <div className="flex w-full flex-col gap-1.5 rounded-cute-m border border-cute-border bg-cute-surface px-3 py-3.5 sm:gap-2 sm:border-0 sm:bg-cute-surface-alt sm:p-4">
      <span
        className="flex h-[26px] w-[26px] items-center justify-center rounded-full sm:hidden"
        style={{ backgroundColor: accent.bg }}
      >
        <Icon size={14} color={accent.fg} />
      </span>
      <div className="hidden items-center gap-1.5 sm:flex">
        <Icon size={14} className="text-cute-text-muted" />
        <span className="font-body text-xs text-cute-text-muted">{stat.label}</span>
      </div>
      <p className="line-clamp-2 font-heading text-[15px] font-semibold break-words text-cute-text sm:text-[19px]">
        {stat.value}
      </p>
      <p className="font-body text-[11px] text-cute-text-muted">
        <span className="sm:hidden">{stat.label}</span>
        <span className="hidden sm:inline">{stat.helper}</span>
      </p>
    </div>
  );
}
