import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ChevronLeft, Image, X } from "lucide-react";
import type { ApiCategory } from "../api/categories";
import { createItem, updateItem } from "../api/inventory";
import { uploadImage } from "../api/uploads";
import { tagChip } from "../data/presentation";
import type { OrganizingItem } from "../types";
import { OptionPicker } from "./OptionPicker";

interface ItemFormModalProps {
  /** When set, the modal edits this item; otherwise it creates a new one. */
  item?: OrganizingItem;
  /** Pre-selected category label for new items (e.g. on a category page). */
  initialCategory?: string;
  /** Already-loaded categories (with nested tags) — the modal does not refetch. */
  apiCategories: ApiCategory[];
  onClose: () => void;
  /** Called after a successful save so the parent can refresh its data. */
  onSaved: () => void;
}

const inputClass =
  "w-full rounded-cute-m border border-cute-border bg-cute-surface px-3.5 py-2.5 font-body text-sm text-cute-text outline-none transition focus:border-cute-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex w-full flex-col gap-1.5">
      <span className="font-body text-xs font-semibold text-cute-text-muted">{label}</span>
      {children}
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
  initialCategory,
  apiCategories,
  onClose,
  onSaved,
}: ItemFormModalProps) {
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item?.category.label ?? initialCategory ?? "");
  const [subcategory, setSubcategory] = useState(item?.subcategory ?? "");
  const [location, setLocation] = useState(item?.location ?? "");
  const [quantity, setQuantity] = useState(item?.quantity ?? 1);
  const [tags, setTags] = useState<string[]>(item?.tags.map((t) => t.label) ?? []);
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [opensOn, setOpensOn] = useState(item?.opensOn ?? "");
  const [expiryDate, setExpiryDate] = useState(item?.expiryDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Existing photo URL (edit mode) and a newly picked file, which wins over it.
  const [imageURL, setImageURL] = useState(item?.imageURL ?? "");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  const photoPreview = useMemo(
    () => (photoFile ? URL.createObjectURL(photoFile) : null),
    [photoFile],
  );
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) setPhotoFile(file);
    // Reset so picking the same file (or retaking a photo) fires again.
    event.target.value = "";
  };

  const removePhoto = () => {
    setPhotoFile(null);
    setImageURL("");
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Default the category select once categories load (create mode only).
  useEffect(() => {
    if (!category && apiCategories.length > 0) {
      setCategory(initialCategory ?? apiCategories[0].name);
    }
  }, [apiCategories, category, initialCategory]);

  const selectedCategory = useMemo(
    () => apiCategories.find((c) => c.name === category),
    [apiCategories, category],
  );

  const subcategorySuggestions = selectedCategory?.subCategories?.map((sc) => sc.name) ?? [];

  const tagSuggestions = selectedCategory?.tags?.map((t) => t.name) ?? [];

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
        category,
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
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-cute-bg pt-[env(safe-area-inset-top)] sm:bg-[#4A3F5555] sm:p-6 sm:pt-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="flex h-full w-full flex-col bg-cute-bg sm:h-auto sm:max-h-[90vh] sm:max-w-[520px] sm:rounded-cute-l sm:bg-cute-surface sm:shadow-[0_20px_50px_-10px_rgba(74,63,85,0.19)]"
      >
        <div className="flex w-full shrink-0 items-center gap-3.5 px-5 pt-5 pb-3 sm:justify-between sm:p-8 sm:pb-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Go back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cute-surface-alt text-cute-text transition hover:brightness-95 sm:hidden"
          >
            <ChevronLeft size={18} />
          </button>
          <h2 className="min-w-0 flex-1 truncate font-heading text-xl font-semibold text-cute-text sm:flex-none sm:text-[22px]">
            {item ? "Edit Item" : "Add Item"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="hidden h-9 w-9 items-center justify-center rounded-full bg-cute-surface-alt text-cute-text-muted transition hover:brightness-95 sm:flex"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 w-full flex-1 flex-col gap-5 overflow-y-auto px-5 py-4 sm:p-8 sm:pt-5">
        <div className="flex w-full flex-col gap-1.5">
          <span className="font-body text-xs font-semibold text-cute-text-muted">
            Photo (optional)
          </span>
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
                  aria-label="Retake photo"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-cute-surface text-cute-text shadow-[0_2px_8px_rgba(74,63,85,0.2)] transition hover:brightness-95"
                >
                  <Camera size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => libraryInputRef.current?.click()}
                  aria-label="Choose a different photo"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-cute-surface text-cute-text shadow-[0_2px_8px_rgba(74,63,85,0.2)] transition hover:brightness-95"
                >
                  <Image size={14} />
                </button>
                <button
                  type="button"
                  onClick={removePhoto}
                  aria-label="Remove photo"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-cute-surface text-cute-danger shadow-[0_2px_8px_rgba(74,63,85,0.2)] transition hover:brightness-95"
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
                className="flex items-center justify-center gap-2 rounded-cute-m border-[1.5px] border-dashed border-cute-border bg-cute-surface px-3.5 py-3 font-body text-sm font-semibold text-cute-text transition hover:bg-cute-surface-alt"
              >
                <Camera size={16} className="text-cute-text-muted" />
                Take Photo
              </button>
              <button
                type="button"
                onClick={() => libraryInputRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-cute-m border-[1.5px] border-dashed border-cute-border bg-cute-surface px-3.5 py-3 font-body text-sm font-semibold text-cute-text transition hover:bg-cute-surface-alt"
              >
                <Image size={16} className="text-cute-text-muted" />
                Choose Photo
              </button>
            </div>
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
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setSubcategory("");
              }}
            >
              {apiCategories.map((c) => (
                <option key={c.id} value={c.name}>
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

        <div className="grid w-full grid-cols-2 gap-4">
          <Field label="Open / First Use Date (optional)">
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

        {error && <p className="font-body text-sm text-cute-danger">{error}</p>}
        </div>

        <div className="flex w-full shrink-0 gap-3 border-t border-cute-border bg-cute-surface px-5 pt-3.5 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:border-0 sm:bg-transparent sm:px-8 sm:pt-0 sm:pb-8">
          <button
            type="button"
            onClick={onClose}
            className="hidden flex-1 items-center justify-center rounded-full border-[1.5px] border-cute-border px-4 py-[13px] font-body text-sm font-semibold text-cute-text transition hover:bg-cute-surface-alt sm:flex"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex flex-1 items-center justify-center rounded-full bg-cute-primary px-4 py-[13px] font-body text-sm font-semibold text-cute-primary-foreground transition hover:brightness-105 disabled:opacity-60"
          >
            {saving ? "Saving…" : item ? "Save Changes" : "Add Item"}
          </button>
        </div>
      </form>
    </div>
  );
}
