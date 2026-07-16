import { Menu } from "lucide-react";

interface HomeTopBarProps {
  onMenuClick: () => void;
}

export function HomeTopBar({ onMenuClick }: HomeTopBarProps) {
  return (
    <div className="flex w-full items-center justify-between px-12 py-6">
      <div className="flex items-center gap-3.5">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-cute-surface-alt text-cute-text transition hover:brightness-95"
        >
          <Menu size={18} />
        </button>
        <span className="font-heading text-2xl font-semibold text-cute-primary">Tidy Nest</span>
      </div>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cute-secondary font-heading text-sm font-medium text-cute-secondary-foreground">
        JD
      </div>
    </div>
  );
}
