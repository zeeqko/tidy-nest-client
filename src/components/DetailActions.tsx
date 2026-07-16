import { Pencil, Trash2 } from "lucide-react";

interface DetailActionsProps {
  onEdit?: () => void;
  onDelete?: () => void;
}

export function DetailActions({ onEdit, onDelete }: DetailActionsProps) {
  return (
    <div className="flex w-full gap-3">
      <button
        type="button"
        onClick={onDelete}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-full border-[1.5px] border-cute-danger px-4 py-[13px] font-body text-sm font-semibold text-cute-danger transition hover:bg-cute-danger/10"
      >
        <Trash2 size={16} />
        Delete
      </button>
      <button
        type="button"
        onClick={onEdit}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-cute-primary px-4 py-[13px] font-body text-sm font-semibold text-cute-primary-foreground transition hover:brightness-105"
      >
        <Pencil size={16} />
        Edit Item
      </button>
    </div>
  );
}
