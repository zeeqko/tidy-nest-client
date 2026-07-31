import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ModalShell } from "./ModalShell";

interface ConfirmDeleteModalProps {
  /** Heading, e.g. `Delete "Whole Milk"?` */
  title: string;
  /** Explanation of what the deletion affects. */
  message: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDeleteModal({ title, message, onCancel, onConfirm }: ConfirmDeleteModalProps) {
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ModalShell variant="alert" level="alert" onClose={onCancel}>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-cute-destructive/15 text-cute-destructive">
        <Trash2 size={24} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="font-heading text-xl font-semibold text-cute-text">{title}</h2>
        <p className="font-body text-sm text-cute-text-muted">{message}</p>
      </div>
      <div className="flex w-full gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex flex-1 items-center justify-center rounded-full border-[1.5px] border-cute-border px-4 py-[13px] font-body text-sm font-semibold text-cute-text transition hover:bg-cute-surface-alt"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={deleting}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-cute-destructive px-4 py-[13px] font-body text-sm font-semibold text-cute-destructive-foreground transition hover:brightness-110 disabled:opacity-60"
        >
          <Trash2 size={15} />
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </ModalShell>
  );
}
