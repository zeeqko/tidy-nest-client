import { Plus } from "lucide-react";

interface HeaderProps {
  totalCount: number;
  onAdd?: () => void;
}

export function Header({ totalCount, onAdd }: HeaderProps) {
  return (
    <div className="flex w-full items-center justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-[26px] font-semibold text-cute-text">
          All Items
        </h1>
        <p className="font-body text-sm text-cute-text-muted">
          {totalCount} items across your home
        </p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1.5 rounded-full bg-cute-primary px-4 py-2.5 font-body text-sm font-medium text-cute-primary-foreground transition hover:brightness-105"
      >
        <Plus size={16} />
        Add Item
      </button>
    </div>
  );
}
