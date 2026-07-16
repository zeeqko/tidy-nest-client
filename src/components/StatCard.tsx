import type { StatEntry } from "../types";

interface StatCardProps {
  stat: StatEntry;
}

export function StatCard({ stat }: StatCardProps) {
  const Icon = stat.icon;

  return (
    <div className="flex w-full flex-col gap-2 rounded-cute-m bg-cute-surface-alt p-4">
      <div className="flex items-center gap-1.5">
        <Icon size={14} className="text-cute-text-muted" />
        <span className="font-body text-xs text-cute-text-muted">{stat.label}</span>
      </div>
      <p className="font-heading text-[19px] font-semibold text-cute-text">{stat.value}</p>
      <p className="font-body text-[11px] text-cute-text-muted">{stat.helper}</p>
    </div>
  );
}
