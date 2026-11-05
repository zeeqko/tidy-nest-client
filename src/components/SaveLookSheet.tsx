import { useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { ModalShell } from "./ModalShell";
import { FilterPill } from "./FilterPill";

export const OCCASION_MAX_LENGTH = 30;
export const LOOK_NAME_MAX_LENGTH = 60;

interface SaveLookSheetProps {
  /** "create" saves a new look; "edit" updates the open look and also
   *  offers "Save as a new look". */
  mode: "create" | "edit";
  /** What the Name field shows (the auto name until the user types). */
  name: string;
  /** Whether `name` is still the live auto name (shows the "✨ auto" hint). */
  isAutoName: boolean;
  /** The current auto name, shown as the placeholder of an emptied field. */
  autoName: string;
  onNameChange(value: string): void;
  /** Chips to show, in order. */
  occasions: string[];
  /** Selected occasion ("" for none). */
  occasion: string;
  onOccasionChange(value: string): void;
  /** Adds a custom occasion (already trimmed, non-empty) and selects it; the
   *  caller dedupes it against `occasions`. */
  onAddOccasion(value: string): void;
  /** Which save request is in flight, if any. */
  saving: "update" | "create" | null;
  error: string | null;
  /** Primary action: create (create mode) or update (edit mode). */
  onSave(): void;
  /** Edit mode only: save the editor state as a brand-new look. */
  onSaveAsNew?(): void;
  onClose(): void;
}

const INPUT_CLASS =
  "w-full rounded-cute-m border border-cute-border bg-cute-surface px-3.5 py-2.5 font-body text-base text-cute-text outline-none transition placeholder:text-cute-text-muted focus:border-cute-primary sm:text-sm";

/**
 * The builder's "Save look" sheet (a bottom sheet over the dimmed builder on
 * phones, a centred card from `sm`, via `ModalShell`'s `sheet` variant): Name (pre-filled with the auto name), Occasion
 * chips with "＋ New", the primary save button and, in edit mode, "Save as a
 * new look". All values live in the page, so closing and reopening the sheet
 * keeps them.
 */
export function SaveLookSheet({
  mode,
  name,
  isAutoName,
  autoName,
  onNameChange,
  occasions,
  occasion,
  onOccasionChange,
  onAddOccasion,
  saving,
  error,
  onSave,
  onSaveAsNew,
  onClose,
}: SaveLookSheetProps) {
  const nameId = useId();
  const autoHintId = useId();
  const newOccasionId = useId();
  const [addingOccasion, setAddingOccasion] = useState(false);
  const [newOccasion, setNewOccasion] = useState("");
  const newOccasionRef = useRef<HTMLInputElement>(null);
  const newChipRef = useRef<HTMLButtonElement>(null);
  const isEdit = mode === "edit";
  const busy = saving !== null;

  const closeNewOccasion = () => {
    setAddingOccasion(false);
    setNewOccasion("");
    // The input is about to unmount; keep focus inside the sheet.
    requestAnimationFrame(() => newChipRef.current?.focus());
  };

  const commitNewOccasion = () => {
    const value = newOccasion.trim().replace(/\s+/g, " ");
    if (value) onAddOccasion(value);
    closeNewOccasion();
  };

  // Escape / backdrop first closes the "＋ New" input, then the sheet; a save
  // in flight can't be dismissed (its result navigates or shows an error here).
  const closeGuard = () => {
    if (busy) return false;
    if (addingOccasion) {
      closeNewOccasion();
      return false;
    }
    return true;
  };
  const close = () => {
    if (!busy) onClose();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!busy) onSave();
  };

  const handleNewOccasionKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      // Adds the chip instead of submitting the form.
      event.preventDefault();
      commitNewOccasion();
    }
  };

  return (
    <ModalShell
      sheet
      level="base"
      onClose={close}
      closeGuard={closeGuard}
      as="form"
      onSubmit={handleSubmit}
      maxWidthClassName="sm:max-w-[28rem]"
      title={isEdit ? "Save changes" : "Save look"}
      bodyClassName="gap-5 px-5 py-4 sm:px-8 sm:pt-5 sm:pb-4"
      footer={
        <div className="flex w-full flex-col items-center gap-2.5">
          <button
            type="submit"
            disabled={busy}
            aria-busy={saving === (isEdit ? "update" : "create")}
            className="flex w-full items-center justify-center rounded-full bg-cute-primary px-5 py-3.5 font-body text-sm font-semibold text-cute-primary-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100"
          >
            {saving === (isEdit ? "update" : "create") ? "Saving…" : isEdit ? "Save changes" : "Save look"}
          </button>
          {isEdit && onSaveAsNew && (
            <button
              type="button"
              onClick={() => {
                if (!busy) onSaveAsNew();
              }}
              disabled={busy}
              aria-busy={saving === "create"}
              className="rounded-full px-3 py-1.5 font-body text-sm font-semibold text-cute-primary transition hover:underline disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:no-underline"
            >
              {saving === "create" ? "Saving as a new look…" : "Save as a new look"}
            </button>
          )}
          <p className="text-center font-body text-xs text-cute-text-muted">
            Name is optional — we suggest one from your pieces
          </p>
        </div>
      }
    >
      <div className="flex w-full flex-col gap-1.5">
        <label htmlFor={nameId} className="font-body text-xs font-semibold text-cute-text-muted">
          Name
        </label>
        <div className="relative w-full">
          <input
            id={nameId}
            type="text"
            value={name}
            maxLength={LOOK_NAME_MAX_LENGTH}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder={autoName}
            autoComplete="off"
            aria-describedby={isAutoName ? autoHintId : undefined}
            className={`${INPUT_CLASS} ${isAutoName ? "pr-20" : ""}`}
          />
          {isAutoName && (
            <span
              id={autoHintId}
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-cute-surface-alt px-2 py-0.5 font-body text-cute-11 font-semibold text-cute-text-muted"
            >
              ✨ auto
            </span>
          )}
        </div>
      </div>

      <fieldset className="flex w-full flex-col gap-2">
        <legend className="mb-2 font-body text-xs font-semibold text-cute-text-muted">Occasion</legend>
        <div className="flex flex-wrap items-center gap-2">
          {occasions.map((value) => (
            <FilterPill
              key={value}
              label={value}
              active={occasion === value}
              pressed={occasion === value}
              onClick={() => onOccasionChange(occasion === value ? "" : value)}
              size="sm"
            />
          ))}
          {!addingOccasion && (
            <button
              ref={newChipRef}
              type="button"
              onClick={() => {
                setAddingOccasion(true);
                requestAnimationFrame(() => newOccasionRef.current?.focus());
              }}
              aria-label="New occasion"
              className="flex items-center gap-1 rounded-full border border-dashed border-cute-primary px-4 py-2 font-body text-xs font-semibold text-cute-primary transition hover:bg-cute-surface-alt"
            >
              ＋ New
            </button>
          )}
        </div>
        {addingOccasion && (
          <div className="flex w-full items-center gap-2">
            <label htmlFor={newOccasionId} className="sr-only">
              New occasion
            </label>
            <input
              ref={newOccasionRef}
              id={newOccasionId}
              type="text"
              value={newOccasion}
              maxLength={OCCASION_MAX_LENGTH}
              onChange={(event) => setNewOccasion(event.target.value)}
              onKeyDown={handleNewOccasionKey}
              placeholder="e.g. Brunch"
              autoComplete="off"
              className={`${INPUT_CLASS} min-w-0 flex-1`}
            />
            <button
              type="button"
              onClick={commitNewOccasion}
              className="shrink-0 rounded-full bg-cute-surface-alt px-4 py-2.5 font-body text-sm font-semibold text-cute-text transition hover:brightness-95"
            >
              Add
            </button>
          </div>
        )}
      </fieldset>

      <p role="alert" className="font-body text-sm text-cute-danger empty:hidden">
        {error}
      </p>
    </ModalShell>
  );
}
