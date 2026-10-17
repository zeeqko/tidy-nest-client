import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Sparkles, X } from "lucide-react";
import type { ApiCategory } from "../api/categories";
import { tagChip } from "../data/presentation";
import { OptionPicker } from "./OptionPicker";

/**
 * Per-card state machine (PLAN.md "bulk add items from a multi-photo
 * selection", settled decision 5): `uploading -> recognizing -> ready ->
 * (edit) -> creating -> done | error`. `creating`/`done` now come from T4's
 * commit pass (`BulkAddItemsModal`'s `runCommitPass`), which moves committed
 * cards `ready -> creating -> done | error`.
 *
 * A failure during upload is a real `error` state (retry/remove, since a
 * missing photo URL means the card cannot be committed at all). A failure
 * during recognition is *not* an error state — recognition is optional, so
 * that card instead lands in `ready` with an empty name and an advisory
 * `note` (decision 8's neighbor).
 *
 * A failure during **commit** is also `error`, distinguished from an
 * upload-stage `error` by `imageURL !== null` (upload never got far enough
 * to set it). A commit-stage error keeps its name/category/subcategory/
 * location fields editable and offers a retry that recommits just this card
 * — see `BulkAddItemsModal.retryCard`.
 */
export type CardStage = "uploading" | "recognizing" | "ready" | "creating" | "done" | "error";

export interface BulkCard {
  /** Stable local id, independent of array position (removal/reordering
   *  must never invalidate an in-flight task's target). */
  id: string;
  /** Original picked file — kept for retry, which re-runs prepare+upload. */
  file: File;
  /** Local `URL.createObjectURL(file)` preview, revoked on removal/unmount. */
  previewUrl: string;
  stage: CardStage;
  name: string;
  categoryId: number | null;
  /** True once the user picks this card's category themselves. Used only so
   *  a late AI match (arriving while the card was still "Recognizing…")
   *  cannot overwrite a manual pick. */
  categoryTouchedByUser: boolean;
  /** True only while the card's category was set by an AI match. */
  aiPickedCategory: boolean;
  /**
   * Single-select subcategory name, mirroring `ItemFormModal`'s own
   * `subcategory` field (PLAN.md "full-parity item fields in the bulk-add
   * review grid", T2). Cleared whenever this card's own category changes
   * (settled decision 9), same as `ItemFormModal` — see
   * `BulkAddItemsModal.handleCategoryChange`.
   */
  subcategory: string;
  /** Free-text storage location, mirroring `ItemFormModal`'s `location`
   *  field. */
  location: string;
  /**
   * Tier-2 fields (PLAN.md "full-parity item fields in the bulk-add review
   * grid", T3), mirroring `ItemFormModal`'s own field shapes exactly so
   * `commitBulkItem` (T1) can normalize them the same way. Held behind the
   * per-card `detailsOpen` disclosure below, not shown in tier 1.
   *
   * `quantity` is a string (so the field can be emptied while typing, same
   * reason `ItemFormModal` holds it as a string) — clamped to an integer
   * `>= 1` on blur for display only; the actual payload clamp happens once,
   * centrally, inside `commitBulkItem`. `tags` are plain names, converted to
   * `{ name }[]` by `commitBulkItem`, not here. `opensOn`/`expiryDate` are
   * `YYYY-MM-DD` or `""`, forwarded raw. `notes` is forwarded raw
   * (untrimmed) — `commitBulkItem` trims it.
   */
  quantity: string;
  tags: string[];
  opensOn: string;
  expiryDate: string;
  notes: string;
  /**
   * Per-card "More details" disclosure state (decision 1). Defaults to
   * `false` on every card regardless of category — deliberately diverging
   * from `ItemFormModal`'s `remindsByDefault` auto-open (see the T3 ticket).
   * A manual per-card toggle sticks: nothing else ever writes to this field
   * except the toggle itself, so a category change or a recognition match
   * landing on this card can never clobber it.
   */
  detailsOpen: boolean;
  /** Advisory copy only — never blocks committing (decision 8's
   *  couldn't-match-category note, or a recognize-stage failure message). */
  note: string | null;
  /** Upload- or commit-stage failure message (`stage === "error"` only) —
   *  which one is distinguished by `imageURL`. */
  error: string | null;
  /** Whether `error` is worth retrying as-is (mirrors `StageFailure.retryable`). */
  retryable: boolean;
  /** Uploaded photo URL, set once the upload stage succeeds. Doubles as the
   *  upload-vs-commit-error discriminant: non-null on a commit-stage error. */
  imageURL: string | null;
}

interface BulkAddCardProps {
  card: BulkCard;
  apiCategories: ApiCategory[];
  onNameChange: (id: string, name: string) => void;
  onCategoryChange: (id: string, categoryId: number) => void;
  onSubcategoryChange: (id: string, subcategory: string) => void;
  onLocationChange: (id: string, location: string) => void;
  /** Tier-2 field handlers (T3), each the same "id + new value, no closure
   *  over `cards`" shape as the tier-1 handlers above. */
  onQuantityChange: (id: string, quantity: string) => void;
  /** Toggles `name` in/out of this card's tag list — reused for both the
   *  Tags picker's `onSelect` and a chip's own remove button, since removing
   *  an already-selected tag is exactly a second toggle of the same name. */
  onTagsChange: (id: string, name: string) => void;
  onOpensOnChange: (id: string, opensOn: string) => void;
  onExpiryDateChange: (id: string, expiryDate: string) => void;
  onNotesChange: (id: string, notes: string) => void;
  /** Flips this card's own `detailsOpen`. */
  onToggleDetails: (id: string) => void;
  /**
   * Idempotent open-picker bookkeeping (settled decision 4): called with
   * this card's id, a field key (`"subcategory"` or `"tags"`, kept distinct
   * so one card's open Tags picker can't cancel another card's open
   * Subcategory picker in the `closeGuard` computation), and the picker's
   * open state every time `OptionPicker`'s own `onOpenChange` effect fires —
   * which, per the plan's findings, can re-fire on every render of an
   * unstable callback, so the parent's tracking must tolerate repeated
   * adds/deletes of the same key rather than counting them.
   */
  onPickerOpenChange: (id: string, field: string, open: boolean) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  /** True while a commit pass (batch or single-card retry) is in flight
   *  anywhere in the modal. Disables retry on every other card so a second
   *  commit pass can't be triggered while one is already running — the
   *  actual guard is `BulkAddItemsModal`'s ref-based re-entrancy check, this
   *  is the visible half of it. */
  committing: boolean;
}

const fieldClass =
  "w-full rounded-cute-m border border-cute-border bg-cute-surface px-2.5 py-1.5 font-body text-sm text-cute-text outline-none transition focus:border-cute-primary disabled:opacity-60";

/** Compact label wrapper for a card's own fields: a
 *  `<label>` wrapping the control so a `<button>`-based `OptionPicker`
 *  trigger resolves an accessible name from it (settled decision 5).
 *  `OptionPicker` itself takes no `aria-label` prop, which is why this
 *  wrapper — not a bare `aria-label` attribute — is what gives the
 *  Subcategory picker its accessible name.
 *
 *  `srLabel`, when given, is a visually-hidden (`sr-only`) span holding the
 *  *exact* accessible-name text (e.g. "Item subcategory"), and `label`
 *  itself is rendered `aria-hidden` so it contributes nothing to the
 *  computed name — otherwise the label's content-based name would
 *  concatenate both spans. This keeps the on-screen caption terse ("Subcategory",
 *  matching Name/Category/Location's style) while the accessible name stays
 *  exactly what settled decision 5 requires. */
function Field({
  label,
  srLabel,
  children,
}: {
  label: string;
  srLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex w-full flex-col gap-1">
      <span
        aria-hidden={srLabel ? true : undefined}
        className="font-body text-[11px] font-semibold text-cute-text-muted"
      >
        {label}
      </span>
      {srLabel && <span className="sr-only">{srLabel}</span>}
      {children}
    </label>
  );
}

/** One card's presentation — thumbnail, per-stage status, tier-1
 *  name/category/subcategory/location fields, a per-card "More details"
 *  disclosure holding tier-2 quantity/tags/dates/notes (T3), advisory/error
 *  text, retry, remove. The batch (file input, pool, toggle, close guard)
 *  lives in `BulkAddItemsModal`; this component owns no state of its
 *  own, mirroring the `ItemsGrid`/`ItemCard` split already in this codebase.
 *
 *  Memoized (decision 5 of the "full-parity item fields" plan): with up to
 *  30 cards on screen, typing into one card's Name/Location field must not
 *  re-render the other 29. That only holds if every prop below is
 *  referentially stable across a parent re-render triggered by *this*
 *  card's own state change — see the `useCallback`-wrapped handlers in
 *  `BulkAddItemsModal` this component is given. */
export const BulkAddCard = memo(function BulkAddCard({
  card,
  apiCategories,
  onNameChange,
  onCategoryChange,
  onSubcategoryChange,
  onLocationChange,
  onQuantityChange,
  onTagsChange,
  onOpensOnChange,
  onExpiryDateChange,
  onNotesChange,
  onToggleDetails,
  onPickerOpenChange,
  onRetry,
  onRemove,
  committing,
}: BulkAddCardProps) {
  const isUploading = card.stage === "uploading";
  const isRecognizing = card.stage === "recognizing";
  const isError = card.stage === "error";
  const isCreating = card.stage === "creating";
  const isDone = card.stage === "done";
  // A commit-stage error (post-upload — imageURL is set) keeps its
  // name/category/subcategory/location fields editable so the user can fix
  // something before retrying; an ingest-stage error (upload itself failed
  // — imageURL is still null) never had those fields worth showing.
  const isCommitError = isError && card.imageURL !== null;
  const isIngestError = isError && !isCommitError;
  const showOverlay = isUploading || isRecognizing || isCreating;
  const fieldsDisabled = isCreating || isDone || committing;

  const overlayText = isUploading
    ? "Uploading…"
    : isRecognizing
      ? "Recognizing…"
      : isCreating
        ? "Adding…"
        : null;

  // Per settled decision 9: the subcategory picker's options and derived
  // placeholder come from *this card's own* category — mirrors ItemFormModal's `subcategorySuggestions` /
  // `subcategoryPlaceholder` exactly, including the empty-list fallback.
  const selectedCategory = useMemo(
    () => apiCategories.find((c) => c.id === card.categoryId) ?? null,
    [apiCategories, card.categoryId],
  );
  const subcategorySuggestions = selectedCategory?.subCategories ?? [];
  const subcategoryPlaceholder = subcategorySuggestions[0]
    ? `e.g. ${subcategorySuggestions[0].name}`
    : "Add a subcategory";

  // Same rule for tags, per this card's own category (T3).
  const tagSuggestions = selectedCategory?.tags ?? [];
  const tagPlaceholder = tagSuggestions[0] ? `e.g. ${tagSuggestions[0].name}` : "Add a tag";

  // Stable per-card, per-field callback (decision 5 + the idempotent
  // tracking settled decision 4 requires) — `card.id` never changes across
  // this card's own re-renders, and `onPickerOpenChange` is itself a stable
  // `useCallback` from the parent, so this identity is stable too.
  const handleSubcategoryOpenChange = useCallback(
    (open: boolean) => onPickerOpenChange(card.id, "subcategory", open),
    [card.id, onPickerOpenChange],
  );
  // Same idempotent tracking, keyed "tags" (distinct from "subcategory" —
  // T3's own extension of T2's mechanism).
  const handleTagsOpenChange = useCallback(
    (open: boolean) => onPickerOpenChange(card.id, "tags", open),
    [card.id, onPickerOpenChange],
  );

  // A blank name only reads as "wrong" once the user has left the field once
  // (or the card failed to commit) — an untouched blank name stays neutral so
  // a big unset batch isn't a wall of red. The footer's count is unaffected.
  const [nameBlurred, setNameBlurred] = useState(false);
  const nameMissing = (card.stage === "ready" || isCommitError) && card.name.trim() === "";
  const showNameDanger = nameMissing && (nameBlurred || isCommitError);
  const categoryMissing = card.categoryId === null;
  const showCategoryDanger = categoryMissing && !isUploading && !isRecognizing;

  const smallBtn =
    "rounded-full border-[1.5px] border-cute-border px-3 py-1 font-body text-xs font-semibold transition hover:bg-cute-surface-alt disabled:opacity-60";

  // Opening Details can expand the card below the sticky footer; bring it in.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const prevDetailsOpenRef = useRef(card.detailsOpen);
  useEffect(() => {
    if (card.detailsOpen && !prevDetailsOpenRef.current) {
      rootRef.current?.scrollIntoView?.({ block: "nearest" });
    }
    prevDetailsOpenRef.current = card.detailsOpen;
  }, [card.detailsOpen]);

  return (
    <div
      ref={rootRef}
      data-testid="bulk-card"
      className="flex w-full min-w-0 flex-col rounded-cute-l border border-cute-border bg-cute-surface shadow-[0_6px_16px_rgba(74,63,85,0.08)]"
    >
      <div className="flex w-full min-w-0 items-center gap-2.5 p-1.5">
        <div className="relative h-14 w-14 shrink-0">
          <img
            src={card.previewUrl}
            alt=""
            className={`h-full w-full rounded-cute-m object-cover ${showOverlay ? "opacity-60" : ""}`}
          />
          {showOverlay && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cute-surface/90 text-cute-text">
                <Loader2
                  size={14}
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
                <span className="sr-only">{overlayText}</span>
              </span>
            </div>
          )}
          {!isDone && !isCreating && (
            <button
              type="button"
              onClick={() => onRemove(card.id)}
              aria-label="Remove photo"
              className="absolute -top-1.5 -left-1.5 flex h-6 w-6 items-center justify-center rounded-full after:absolute after:-inset-2 after:content-[''] bg-cute-surface text-cute-text shadow-[0_2px_8px_rgba(74,63,85,0.2)] transition hover:brightness-95"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {isIngestError ? (
            <>
              <p className="font-body text-xs text-cute-danger">{card.error}</p>
              <div className="flex items-center gap-2">
                {card.retryable && (
                  <button
                    type="button"
                    onClick={() => onRetry(card.id)}
                    disabled={committing}
                    className={`${smallBtn} text-cute-text`}
                  >
                    Retry
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(card.id)}
                  className={`${smallBtn} text-cute-danger`}
                >
                  Remove
                </button>
              </div>
            </>
          ) : isCreating || isDone ? (
            <>
              <p className="truncate font-body text-sm text-cute-text">{card.name}</p>
              <p className="font-body text-xs font-semibold text-cute-text-muted">
                {isDone ? "Added" : "Adding…"}
              </p>
            </>
          ) : (
            <>
              <input
                className={`${fieldClass} py-1 ${showNameDanger ? "border-cute-danger focus:border-cute-danger" : ""}`}
                value={card.name}
                onChange={(e) => onNameChange(card.id, e.target.value)}
                onBlur={() => setNameBlurred(true)}
                placeholder="Item name"
                disabled={fieldsDisabled}
                aria-label="Item name"
                aria-invalid={showNameDanger ? true : undefined}
              />
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="relative min-w-0 flex-1">
                  {card.aiPickedCategory && (
                    <Sparkles
                      role="img"
                      aria-label="Picked by AI"
                      size={12}
                      className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-cute-primary"
                    />
                  )}
                  <select
                    className={`-my-1.5 h-10 w-full min-w-0 appearance-none truncate rounded-full border-y-[6px] border-x border-transparent bg-cute-surface-alt bg-clip-padding py-0 pr-6 font-body text-xs font-semibold outline-none transition focus:shadow-[inset_0_0_0_1px_var(--color-cute-primary)] disabled:opacity-60 ${
                      card.aiPickedCategory ? "pl-6" : "pl-2.5"
                    } ${
                      showCategoryDanger
                        ? "text-cute-danger shadow-[inset_0_0_0_1px_var(--color-cute-danger)]"
                        : "text-cute-text shadow-[inset_0_0_0_1px_var(--color-cute-border)]"
                    }`}
                    value={card.categoryId ?? ""}
                    onChange={(e) => {
                      if (e.target.value !== "") onCategoryChange(card.id, Number(e.target.value));
                    }}
                    disabled={fieldsDisabled}
                    aria-label="Item category"
                    aria-invalid={showCategoryDanger ? true : undefined}
                  >
                    <option value="" disabled={card.categoryId !== null}>
                      Choose category
                    </option>
                    {apiCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={12}
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-cute-text-muted"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onToggleDetails(card.id)}
                  aria-expanded={card.detailsOpen}
                  className="relative flex h-7 shrink-0 items-center gap-0.5 rounded-full px-2 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] font-body text-xs font-semibold text-cute-primary transition hover:bg-cute-surface-alt"
                >
                  Details
                  <ChevronDown
                    size={13}
                    aria-hidden="true"
                    className={`shrink-0 transition-transform ${card.detailsOpen ? "rotate-180" : ""}`}
                  />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {!isIngestError && !isCreating && !isDone && (
        <>
          {card.detailsOpen && (
            <div className="flex w-full flex-col gap-2 border-t border-cute-border p-3">
              {/* srLabel carries the exact accessible names (settled
                  decision 5); the visible caption stays terse — see
                  `Field`'s own docstring. */}
              <Field label="Subcategory" srLabel="Item subcategory">
                {fieldsDisabled || card.categoryId === null ? (
                  // OptionPicker has no `disabled` prop (shared with
                  // ItemFormModal), and its trigger is a real `<button>`, so
                  // a CSS-only wrapper would stay keyboard-operable. Swap in
                  // a static, non-interactive lookalike instead.
                  <div
                    aria-hidden="true"
                    className="flex w-full items-center justify-between gap-2 rounded-cute-m border border-cute-border bg-cute-surface px-3.5 py-2.5 font-body text-sm opacity-60"
                  >
                    <span className="truncate text-cute-text-muted">
                      {card.categoryId === null
                        ? "Choose a category first"
                        : card.subcategory || subcategoryPlaceholder}
                    </span>
                    <ChevronDown size={15} className="shrink-0 text-cute-text-muted" />
                  </div>
                ) : (
                  <OptionPicker
                    options={subcategorySuggestions}
                    selected={card.subcategory ? [card.subcategory] : []}
                    placeholder={subcategoryPlaceholder}
                    noun="subcategory"
                    onSelect={(name) => onSubcategoryChange(card.id, name)}
                    onOpenChange={handleSubcategoryOpenChange}
                  />
                )}
              </Field>

              <Field label="Storage Location">
                <input
                  className={fieldClass}
                  value={card.location}
                  onChange={(e) => onLocationChange(card.id, e.target.value)}
                  placeholder="e.g. Kitchen → Fridge"
                  disabled={fieldsDisabled}
                  aria-label="Item location"
                />
              </Field>

              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="Quantity">
                  <input
                    className={fieldClass}
                    type="number"
                    min={1}
                    value={card.quantity}
                    onChange={(e) =>
                      onQuantityChange(card.id, e.target.value.replace(/[^0-9]/g, ""))
                    }
                    onBlur={() =>
                      onQuantityChange(card.id, String(Math.max(1, Number(card.quantity) || 0)))
                    }
                    disabled={fieldsDisabled}
                    aria-label="Item quantity"
                  />
                </Field>
                <Field label="Tags" srLabel="Item tags">
                  {fieldsDisabled ? (
                    <div
                      aria-hidden="true"
                      className="flex w-full items-center justify-between gap-2 rounded-cute-m border border-cute-border bg-cute-surface px-3.5 py-2.5 font-body text-sm opacity-60"
                    >
                      <span className="truncate text-cute-text-muted">
                        {card.tags.length > 0 ? card.tags.join(", ") : tagPlaceholder}
                      </span>
                      <ChevronDown size={15} className="shrink-0 text-cute-text-muted" />
                    </div>
                  ) : (
                    <OptionPicker
                      options={tagSuggestions}
                      selected={card.tags}
                      multiple
                      placeholder={tagPlaceholder}
                      noun="tag"
                      onSelect={(name) => onTagsChange(card.id, name)}
                      onOpenChange={handleTagsOpenChange}
                    />
                  )}
                </Field>
              </div>

              {card.tags.length > 0 && (
                <div className="flex w-full flex-wrap items-center gap-1.5">
                  {card.tags.map((t) => {
                    const colours = tagChip(t);
                    return (
                      <span
                        key={t}
                        style={{ backgroundColor: colours.bg, color: colours.fg }}
                        className="flex items-center gap-1 rounded-full py-1 pr-2 pl-2.5 font-body text-[11px] font-semibold"
                      >
                        {t}
                        <button
                          type="button"
                          aria-label={`Remove ${t}`}
                          onClick={() => onTagsChange(card.id, t)}
                          disabled={fieldsDisabled}
                          className="transition hover:opacity-70 disabled:opacity-60"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="Opened On">
                  <input
                    className={`${fieldClass} min-w-0`}
                    type="date"
                    value={card.opensOn}
                    onChange={(e) => onOpensOnChange(card.id, e.target.value)}
                    disabled={fieldsDisabled}
                    aria-label="Item opened on"
                  />
                </Field>
                <Field label="Expiry Date">
                  <input
                    className={`${fieldClass} min-w-0`}
                    type="date"
                    value={card.expiryDate}
                    onChange={(e) => onExpiryDateChange(card.id, e.target.value)}
                    disabled={fieldsDisabled}
                    aria-label="Item expiry date"
                  />
                </Field>
              </div>

              <Field label="Notes">
                <textarea
                  className={`${fieldClass} min-h-[60px] resize-y`}
                  value={card.notes}
                  onChange={(e) => onNotesChange(card.id, e.target.value)}
                  placeholder="Anything worth remembering about this item"
                  disabled={fieldsDisabled}
                  aria-label="Item notes"
                />
              </Field>
            </div>
          )}

          {(card.note || isCommitError) && (
            <div className="flex flex-col gap-1.5 px-2 pb-2">
              {card.note && (
                <p className="font-body text-[11px] text-cute-text-muted">{card.note}</p>
              )}
              {isCommitError && (
                <>
                  <p className="font-body text-xs text-cute-danger">{card.error}</p>
                  <div className="flex items-center gap-2">
                    {card.retryable && (
                      <button
                        type="button"
                        onClick={() => onRetry(card.id)}
                        // A cleared name makes this card uncommittable —
                        // retrying would resend a payload the backend rejects.
                        disabled={committing || card.name.trim() === ""}
                        className={`${smallBtn} text-cute-text`}
                      >
                        Retry
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemove(card.id)}
                      className={`${smallBtn} text-cute-danger`}
                    >
                      Remove
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
});
