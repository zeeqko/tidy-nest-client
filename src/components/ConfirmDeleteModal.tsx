import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#4A3F5555] p-4 sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="flex w-full max-w-[420px] flex-col items-center gap-4 rounded-cute-l bg-cute-surface p-8 text-center shadow-[0_20px_50px_-10px_rgba(74,63,85,0.19)]">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FF7A9022] text-cute-danger">
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
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-cute-danger px-4 py-[13px] font-body text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
          >
            <Trash2 size={15} />
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
