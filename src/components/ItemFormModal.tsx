import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Image, Sparkles, X } from "lucide-react";
import type { ApiCategory } from "../api/categories";
import { createItem, updateItem } from "../api/inventory";
import { recognizeItem } from "../api/recognition";
import { uploadImage } from "../api/uploads";
import { tagChip } from "../data/presentation";
import type { OrganizingItem } from "../types";
import { ModalShell } from "./ModalShell";
import { OptionPicker } from "./OptionPicker";

interface ItemFormModalProps {
  /** When set, the modal edits this item; otherwise it creates a new one. */
  item?: OrganizingItem;
  /**
   * Pre-selected category id for new items (e.g. on a category page).
   * Wins over `initialCategory` when both are given.
   */
  initialCategoryId?: number;
  /** Pre-selected category label for new items — fallback when `initialCategoryId` isn't given. */
  initialCategory?: string;
  /** Already-loaded categories (with nested tags) — the modal does not refetch. */
  apiCategories: ApiCategory[];
  onClose: () => void;
  /** Called after a successful save so the parent can refresh its data. */
  onSaved: () => void;
}

const inputClass =
  "w-full rounded-cute-m border border-cute-border bg-cute-surface px-3.5 py-2.5 font-body text-sm text-cute-text outline-none transition focus:border-cute-primary";

function Field({
  label,
  helper,
  children,
}: {
  label: string;
  /** Optional one-line explanatory copy rendered under the input. */
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex w-full flex-col gap-1.5">
      <span className="font-body text-xs font-semibold text-cute-text-muted">{label}</span>
      {children}
      {helper && <span className="font-body text-xs text-cute-text-muted">{helper}</span>}
    </label>
  );
}

const MAX_PHOTO_DIMENSION = 1280;

/**
 * Downscales a photo to a phone-friendly upload size (JPEG, longest side
 * MAX_PHOTO_DIMENSION). Falls back to the original file if decoding fails.
 */
async function preparePhoto(file: File): Promise<{ blob: Blob; filename: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas context");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    if (!blob) throw new Error("canvas export failed");
    return { blob, filename: "photo.jpg" };
  } catch {
    return { blob: file, filename: file.name || "photo" };
  }
}

export function ItemFormModal({
  item,
  initialCategoryId,
  initialCategory,
  apiCategories,
  onClose,
  onSaved,
}: ItemFormModalProps) {
  const [name, setName] = useState(item?.name ?? "");
  // Held by id (not label) so it survives duplicate/renamed category names;
  // resolved to a name only when building the request payload below.
  const [categoryId, setCategoryId] = useState<number | null>(() => {
    if (item?.categoryId) {
      const parsed = Number(item.categoryId);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return initialCategoryId ?? null;
  });
  const [subcategory, setSubcategory] = useState(item?.subcategory ?? "");
  const [location, setLocation] = useState(item?.location ?? "");
  const [quantity, setQuantity] = useState(item?.quantity ?? 1);
  const [tags, setTags] = useState<string[]>(item?.tags.map((t) => t.label) ?? []);
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [opensOn, setOpensOn] = useState(item?.opensOn ?? "");
  const [expiryDate, setExpiryDate] = useState(item?.expiryDate ?? "");
  // Manual "show optional fields" disclosure for categories that don't track
  // dates by default (selectedCategory?.reminderOnExpiry === false). Defaults
  // open when the item already carries a date (e.g. edit mode on a
  // non-tracking category) so existing data is never hidden on open.
  const [showDateFields, setShowDateFields] = useState(
    () => Boolean(item?.opensOn || item?.expiryDate),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // Dropdown open state, lifted up from each OptionPicker so Escape can close
  // just the open dropdown first, and the modal only on a second press.
  const [subcategoryPickerOpen, setSubcategoryPickerOpen] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

  // Latest onClose, read from the history-guard effect below without making
  // that effect (which must run only once per mount) depend on it.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // History-guard bookkeeping for the effect below. These must be refs (not
  // effect-local variables) so they survive React StrictMode's dev-only
  // synchronous mount→cleanup→mount without double-pushing history or
  // self-closing the modal.
  const historyPushedRef = useRef(false);
  const componentMountedRef = useRef(false);
  const poppedByBrowserRef = useRef(false);

  // Existing photo URL (edit mode) and a newly picked file, which wins over it.
  const [imageURL, setImageURL] = useState(item?.imageURL ?? "");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  // AI Recognition is only offered when adding a new item (not editing one).
  // In "ai" mode, picking a photo also asks Gemini for a category + name and
  // prefills the fields below; "manual" mode is today's plain photo attach.
  const [uploadMode, setUploadMode] = useState<"manual" | "ai">("manual");
  const [recognizing, setRecognizing] = useState(false);
  const [recognitionError, setRecognitionError] = useState<string | null>(null);
  const [recognitionNote, setRecognitionNote] = useState<string | null>(null);
  // Bumped whenever an in-flight recognition should be considered stale (mode
  // switch, photo removed) so its eventual response is dropped instead of
  // overwriting fields the user has since moved past.
  const recognitionRequestIdRef = useRef(0);

  const photoPreview = useMemo(
    () => (photoFile ? URL.createObjectURL(photoFile) : null),
    [photoFile],
  );
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  // Sends file to Gemini and, on success, prefills name + category. Category
  // is matched case-insensitively against apiCategories because the backend
  // constrains Gemini's answer to one of the caller's own category names but
  // still returns it as free text.
  const runRecognition = useCallback(
    async (file: File) => {
      const requestId = ++recognitionRequestIdRef.current;
      setRecognizing(true);
      setRecognitionError(null);
      setRecognitionNote(null);
      try {
        const prepared = await preparePhoto(file);
        const result = await recognizeItem(prepared.blob, prepared.filename);
        // The user may have switched to Manual or removed the photo while
        // this was in flight — a stale result must not overwrite what they
        // see now.
        if (recognitionRequestIdRef.current !== requestId) return;
        setName(result.itemName);
        const match = apiCategories.find(
          (c) => c.name.toLowerCase() === result.category.toLowerCase(),
        );
        if (match) {
          setCategoryId(match.id);
          setRecognitionNote(`Detected: ${result.category} → ${result.itemName}`);
        } else {
          setRecognitionNote(
            `Detected "${result.itemName}" but couldn't match category "${result.category}" — pick one manually.`,
          );
        }
      } catch (err) {
        if (recognitionRequestIdRef.current !== requestId) return;
        setRecognitionError(
          err instanceof Error
            ? err.message
            : "Couldn't recognize this item — fill in the details manually.",
        );
      } finally {
        if (recognitionRequestIdRef.current === requestId) setRecognizing(false);
      }
    },
    [apiCategories],
  );

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so picking the same file (or retaking a photo) fires again.
    event.target.value = "";
    if (!file) return;
    setPhotoFile(file);
    if (uploadMode === "ai") void runRecognition(file);
  };

  const removePhoto = () => {
    recognitionRequestIdRef.current += 1;
    setPhotoFile(null);
    setImageURL("");
    setRecognizing(false);
    setRecognitionError(null);
    setRecognitionNote(null);
  };

  // Escape closes only an open dropdown first (OptionPicker's own effect
  // handles that); the modal itself only on a second press with no dropdown
  // open (mirrors ManageCategoriesModal's `!pendingDelete && !editorOpen`
  // guard) — enforced via ModalShell's `closeGuard`.
  const closeGuard = useCallback(
    () => !subcategoryPickerOpen && !tagPickerOpen,
    [subcategoryPickerOpen, tagPickerOpen],
  );

  // Scroll a freshly-set error into view — it's the last child of the
  // scrollable body and otherwise invisible without a manual scroll.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [error]);

  // Push a history entry while the modal is open so browser Back closes it
  // instead of navigating away; on popstate, close (don't navigate) and skip
  // the extra pop below since the browser already did it. On a genuine
  // unmount (Save/Cancel/close), pop our own entry so none are left behind.
  // The pop is deferred a tick, and guarded by componentMountedRef, so
  // React's StrictMode dev-only synchronous mount→cleanup→mount (which would
  // otherwise double-push then wrongly pop/self-close) settles safely: the
  // second mount skips pushing again (historyPushedRef already true) and the
  // deferred pop from the first mount's cleanup sees the component is mounted
  // again and no-ops.
  useEffect(() => {
    componentMountedRef.current = true;
    if (!historyPushedRef.current) {
      window.history.pushState({ itemFormModal: true }, "");
      historyPushedRef.current = true;
    }
    const handlePopState = () => {
      poppedByBrowserRef.current = true;
      onCloseRef.current();
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      componentMountedRef.current = false;
      window.removeEventListener("popstate", handlePopState);
      if (poppedByBrowserRef.current) return;
      setTimeout(() => {
        if (!componentMountedRef.current && historyPushedRef.current) {
          historyPushedRef.current = false;
          window.history.back();
        }
      }, 0);
    };
  }, []);

  // Default the category once categories load (create mode only), and as a
  // fallback for edit mode if the item's own category no longer exists.
  useEffect(() => {
    if (categoryId !== null || apiCategories.length === 0) return;
    const fallbackId =
      initialCategoryId ??
      apiCategories.find((c) => c.name === initialCategory)?.id ??
      apiCategories[0].id;
    setCategoryId(fallbackId);
  }, [apiCategories, categoryId, initialCategoryId, initialCategory]);

  const selectedCategory = useMemo(
    () => apiCategories.find((c) => c.id === categoryId) ?? null,
    [apiCategories, categoryId],
  );

  const subcategorySuggestions = selectedCategory?.subCategories ?? [];

  const tagSuggestions = selectedCategory?.tags ?? [];

  // Food/Makeup-style categories track dates by default (reminderOnExpiry);
  // everything else stays collapsed behind the disclosure until the user
  // opts in. Switching categories preserves any values already typed — they
  // just stop being shown if the newly selected category doesn't track
  // dates by default and the disclosure hasn't been opened.
  const remindsByDefault = Boolean(selectedCategory?.reminderOnExpiry);
  const datesVisible = remindsByDefault || showDateFields;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      let photoURL = imageURL;
      if (photoFile) {
        const prepared = await preparePhoto(photoFile);
        photoURL = (await uploadImage(prepared.blob, prepared.filename)).url;
      }
      const payload = {
        name: name.trim(),
        category: selectedCategory?.name ?? "",
        subcategory: subcategory.trim(),
        location: location.trim(),
        quantity,
        tags: tags.map((t) => ({ name: t })),
        notes: notes.trim(),
        opensOn,
        expiryDate,
        imageURL: photoURL,
      };
      if (item) {
        await updateItem(item.id, payload);
      } else {
        await createItem(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save item");
      setSaving(false);
    }
  };

  return (
    <ModalShell
      level="elevated"
      onClose={onClose}
      closeGuard={closeGuard}
      as="form"
      onSubmit={handleSubmit}
      maxWidthClassName="sm:max-w-[520px]"
      title={item ? "Edit Item" : "Add Item"}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="hidden flex-1 items-center justify-center rounded-full border-[1.5px] border-cute-border px-4 py-[13px] font-body text-sm font-semibold text-cute-text transition hover:bg-cute-surface-alt sm:flex"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || recognizing}
            className="flex flex-1 items-center justify-center rounded-full bg-cute-primary px-4 py-[13px] font-body text-sm font-semibold text-cute-primary-foreground transition hover:brightness-105 disabled:opacity-60"
          >
            {saving ? "Saving…" : item ? "Save Changes" : "Add Item"}
          </button>
        </>
      }
      footerClassName="flex w-full shrink-0 gap-3 border-t border-cute-border bg-cute-surface px-5 pt-3.5 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:border-0 sm:bg-transparent sm:px-8 sm:pt-0 sm:pb-8"
    >
        <div className="flex w-full flex-col gap-1.5">
          <span className="font-body text-xs font-semibold text-cute-text-muted">
            Photo (optional)
          </span>
          {!item && (
            <div className="flex w-full rounded-full border-[1.5px] border-cute-border bg-cute-surface p-1">
              {(
                [
                  { value: "manual", label: "Manual" },
                  { value: "ai", label: "AI Recognition" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={recognizing}
                  onClick={() => {
                    recognitionRequestIdRef.current += 1;
                    setRecognizing(false);
                    setUploadMode(option.value);
                    setRecognitionError(null);
                    setRecognitionNote(null);
                  }}
                  className={`flex-1 rounded-full px-3 py-1.5 font-body text-xs font-semibold transition disabled:opacity-60 ${
                    uploadMode === option.value
                      ? "bg-cute-primary text-cute-primary-foreground"
                      : "text-cute-text-muted hover:text-cute-text"
                  }`}
                >
                  {option.value === "ai" && <Sparkles size={12} className="mr-1 inline-block" />}
                  {option.label}
                </button>
              ))}
            </div>
          )}
          {uploadMode === "ai" && !photoPreview && !imageURL && (
            <p className="font-body text-xs text-cute-text-muted">
              Upload a photo and we'll suggest a category and name.
            </p>
          )}
          {photoPreview || imageURL ? (
            <div className="relative w-full overflow-hidden rounded-cute-m border border-cute-border">
              <img
                src={photoPreview ?? imageURL}
                alt="Item photo"
                className="h-44 w-full object-cover"
              />
              <div className="absolute top-2 right-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={recognizing}
                  aria-label="Retake photo"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-cute-surface text-cute-text shadow-[0_2px_8px_rgba(74,63,85,0.2)] transition hover:brightness-95 disabled:opacity-60"
                >
                  <Camera size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => libraryInputRef.current?.click()}
                  disabled={recognizing}
                  aria-label="Choose a different photo"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-cute-surface text-cute-text shadow-[0_2px_8px_rgba(74,63,85,0.2)] transition hover:brightness-95 disabled:opacity-60"
                >
                  <Image size={14} />
                </button>
                <button
                  type="button"
                  onClick={removePhoto}
                  disabled={recognizing}
                  aria-label="Remove photo"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-cute-surface text-cute-danger shadow-[0_2px_8px_rgba(74,63,85,0.2)] transition hover:brightness-95 disabled:opacity-60"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="grid w-full grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={recognizing}
                className="flex items-center justify-center gap-2 rounded-cute-m border-[1.5px] border-dashed border-cute-border bg-cute-surface px-3.5 py-3 font-body text-sm font-semibold text-cute-text transition hover:bg-cute-surface-alt disabled:opacity-60"
              >
                <Camera size={16} className="text-cute-text-muted" />
                Take Photo
              </button>
              <button
                type="button"
                onClick={() => libraryInputRef.current?.click()}
                disabled={recognizing}
                className="flex items-center justify-center gap-2 rounded-cute-m border-[1.5px] border-dashed border-cute-border bg-cute-surface px-3.5 py-3 font-body text-sm font-semibold text-cute-text transition hover:bg-cute-surface-alt disabled:opacity-60"
              >
                <Image size={16} className="text-cute-text-muted" />
                Choose Photo
              </button>
            </div>
          )}
          {recognizing && (
            <p className="font-body text-xs font-semibold text-cute-primary">Recognizing…</p>
          )}
          {recognitionNote && !recognizing && (
            <p className="font-body text-xs font-semibold text-cute-text">{recognitionNote}</p>
          )}
          {recognitionError && !recognizing && (
            <p className="font-body text-xs text-cute-danger">{recognitionError}</p>
          )}
          {/* capture opens the camera directly on phones; without it the
              picker offers the photo library. Desktops treat both as pickers. */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhotoChange}
          />
          <input
            ref={libraryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoChange}
          />
        </div>

        <Field label="Name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Whole Milk"
            autoFocus
          />
        </Field>

        <div className="grid w-full grid-cols-2 gap-4">
          <Field label="Category">
            <select
              className={inputClass}
              value={categoryId ?? ""}
              onChange={(e) => {
                const id = Number(e.target.value);
                setCategoryId(Number.isNaN(id) ? null : id);
                setSubcategory("");
              }}
            >
              {apiCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Subcategory">
            <OptionPicker
              options={subcategorySuggestions}
              selected={subcategory ? [subcategory] : []}
              placeholder="e.g. Dairy"
              noun="subcategory"
              onSelect={setSubcategory}
              onOpenChange={setSubcategoryPickerOpen}
            />
          </Field>
        </div>

        <div className="grid w-full grid-cols-2 gap-4">
          <Field label="Quantity">
            <input
              className={inputClass}
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
            />
          </Field>
          <Field label="Tags (optional)">
            <OptionPicker
              options={tagSuggestions}
              selected={tags}
              multiple
              placeholder="e.g. Fresh"
              noun="tag"
              onSelect={(name) =>
                setTags((current) =>
                  current.includes(name)
                    ? current.filter((t) => t !== name)
                    : [...current, name],
                )
              }
              onOpenChange={setTagPickerOpen}
            />
          </Field>
        </div>

        {tags.length > 0 && (
          <div className="-mt-2 flex w-full flex-wrap items-center gap-2">
            {tags.map((t) => {
              const colours = tagChip(t);
              return (
                <span
                  key={t}
                  style={{ backgroundColor: colours.bg, color: colours.fg }}
                  className="flex items-center gap-1.5 rounded-full py-1.5 pr-2.5 pl-3.5 font-body text-xs font-semibold"
                >
                  {t}
                  <button
                    type="button"
                    aria-label={`Remove ${t}`}
                    onClick={() => setTags((current) => current.filter((x) => x !== t))}
                    className="transition hover:opacity-70"
                  >
                    <X size={12} />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {datesVisible ? (
          <div className="flex w-full flex-col gap-2">
            <div className="grid w-full grid-cols-2 gap-4">
              <Field
                label="Opened On"
                helper="For items with a shelf life once opened, like food or makeup."
              >
                <input
                  className={inputClass}
                  type="date"
                  value={opensOn}
                  onChange={(e) => setOpensOn(e.target.value)}
                />
              </Field>
              <Field label="Expiry Date (optional)">
                <input
                  className={inputClass}
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </Field>
            </div>
            {!remindsByDefault && (
              <button
                type="button"
                onClick={() => setShowDateFields(false)}
                className="self-start font-body text-xs font-semibold text-cute-text-muted underline-offset-2 hover:underline"
              >
                Hide date fields
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowDateFields(true)}
            className="self-start font-body text-xs font-semibold text-cute-primary underline-offset-2 hover:underline"
          >
            + Add an opened-on or expiry date
          </button>
        )}

        <Field label="Storage Location">
          <input
            className={inputClass}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Kitchen → Fridge"
          />
        </Field>

        <Field label="Notes">
          <textarea
            className={`${inputClass} min-h-[80px] resize-y`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth remembering about this item"
          />
        </Field>

        {error && (
          <p ref={errorRef} className="font-body text-sm text-cute-danger">
            {error}
          </p>
        )}
        </ModalShell>
  );
}
