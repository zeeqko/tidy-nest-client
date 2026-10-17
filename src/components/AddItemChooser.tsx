import { Image, Images } from "lucide-react";
import { ModalShell } from "./ModalShell";

interface AddItemChooserProps {
  onClose: () => void;
  /** Opens today's single-item `ItemFormModal`, unchanged. */
  onChooseSingle: () => void;
  /** Opens `BulkAddItemsModal`. */
  onChooseBulk: () => void;
}

const optionButtonClass =
  "flex w-full items-center gap-3.5 rounded-cute-m border-[1.5px] border-cute-border bg-cute-surface px-4 py-3.5 text-left transition hover:border-cute-primary hover:bg-cute-surface-alt";

/**
 * Entry-point chooser rendered in place of directly opening `ItemFormModal`
 * on all three add-item surfaces (PLAN.md "bulk add items from a
 * multi-photo selection", decision 1). `ModalShell` `variant="alert"`,
 * matching `ConfirmDeleteModal`'s shape. "Add one item" is listed first so
 * it receives initial focus (`ModalShell` focuses the first focusable node
 * in the card on mount) and opens today's flow unchanged; "Add multiple
 * photos" opens `BulkAddItemsModal`.
 */
export function AddItemChooser({ onClose, onChooseSingle, onChooseBulk }: AddItemChooserProps) {
  return (
    <ModalShell variant="alert" level="alert" onClose={onClose}>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-cute-primary/15 text-cute-primary">
        <Image size={24} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="font-heading text-xl font-semibold text-cute-text">Add Items</h2>
        <p className="font-body text-sm text-cute-text-muted">
          Add one item with full details, or add several at once from a batch of photos.
        </p>
      </div>
      <div className="flex w-full flex-col gap-3 pt-2">
        <button type="button" onClick={onChooseSingle} className={optionButtonClass}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cute-primary/15 text-cute-primary">
            <Image size={18} />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="font-body text-sm font-semibold text-cute-text">Add one item</span>
            <span className="font-body text-xs text-cute-text-muted">
              Full form with photo, category, tags, and more.
            </span>
          </span>
        </button>
        <button type="button" onClick={onChooseBulk} className={optionButtonClass}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cute-secondary/25 text-cute-text">
            <Images size={18} />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="font-body text-sm font-semibold text-cute-text">
              Add multiple photos
            </span>
            <span className="font-body text-xs text-cute-text-muted">
              Pick several photos and fill in the details after.
            </span>
          </span>
        </button>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="flex w-full items-center justify-center rounded-full border-[1.5px] border-cute-border px-4 py-[13px] font-body text-sm font-semibold text-cute-text transition hover:bg-cute-surface-alt"
      >
        Cancel
      </button>
    </ModalShell>
  );
}
