import { useEffect, useState } from "react";
import { Check, ChevronLeft, Trash2, X } from "lucide-react";
import {
  attachTag,
  createCategory,
  createSubCategory,
  deleteCategory,
  deleteSubCategory,
  detachTag,
  updateCategory,
  type ApiCategory,
} from "../api/categories";
import { toUiCategory } from "../data/categories";
import { categoryIconOptions, defaultCategoryColour } from "../data/categoryIcons";
import { tagChip } from "../data/presentation";
import type { RefreshScope } from "../types";
import { CategoryBadge } from "./CategoryBadge";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { InlineAdd } from "./InlineAdd";

interface EditCategoryModalProps {
  /** When set, the modal edits this category; otherwise it creates a new one. */
  category?: ApiCategory;
  onClose: () => void;
  /** Called after a successful save/delete with what actually changed. */
  onSaved: (changes: RefreshScope) => void;
}

/** A staged chip; `id` is set only for chips that already exist on the server. */
interface ChipState {
  id?: number;
  name: string;
  colour?: string | null;
}

const swatches = [
  "#FFD873",
  "#C9B6FF",
  "#FF7A90",
  "#FF8FAB",
  "#B8EFC0",
  "#FFE3C2",
  "#D6ECFF",
  "#E8D5B7",
];

function FieldLabel({ children }: { children: string }) {
  return <p className="font-body text-sm font-medium text-cute-text">{children}</p>;
}

interface ChipProps {
  chip: ChipState;
  coloured?: boolean;
  onRemove: () => void;
}

function Chip({ chip, coloured, onRemove }: ChipProps) {
  const colours = coloured ? tagChip(chip.name, chip.colour ?? undefined) : null;
  return (
    <span
      style={colours ? { backgroundColor: colours.bg, color: colours.fg } : undefined}
      className={`flex items-center gap-1.5 rounded-full py-1.5 pr-2.5 pl-3.5 font-body text-xs ${
        colours ? "font-semibold" : "border border-cute-border bg-cute-surface-alt text-cute-text"
      }`}
    >
      {chip.name}
      <button
        type="button"
        aria-label={`Remove ${chip.name}`}
        onClick={onRemove}
        className={colours ? "transition hover:opacity-70" : "text-cute-text-muted transition hover:text-cute-danger"}
      >
        <X size={12} />
      </button>
    </span>
  );
}

export function EditCategoryModal({ category, onClose, onSaved }: EditCategoryModalProps) {
  const isEdit = category !== undefined;

  const [name, setName] = useState(category?.name ?? "");
  // Only seed the picker with icons it actually offers; image-based categories
  // (e.g. seeded 'food') start unselected so the image keeps showing.
  const [icon, setIcon] = useState(() =>
    category?.icon && categoryIconOptions[category.icon] ? category.icon : "",
  );
  const [colour, setColour] = useState(category?.colour ?? "");
  const [subs, setSubs] = useState<ChipState[]>(
    category?.subCategories.map((sub) => ({ id: sub.id, name: sub.name })) ?? [],
  );
  // Tag chips staged locally; nothing is sent to the API until Save.
  const [tagChips, setTagChips] = useState<ChipState[]>(
    () => category?.tags?.map((tag) => ({ id: tag.id, name: tag.name, colour: tag.colour })) ?? [],
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !confirmingDelete) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, confirmingDelete]);

  const addChip = (setter: typeof setSubs) => (chipName: string) => {
    setter((chips) =>
      chips.some((c) => c.name.toLowerCase() === chipName.toLowerCase())
        ? chips
        : [...chips, { name: chipName }],
    );
  };

  const removeChip = (setter: typeof setSubs) => (chip: ChipState) => {
    setter((chips) => chips.filter((c) => c !== chip));
  };

  const iconSrc = category ? toUiCategory(category).iconSrc : undefined;
  const previewColour = colour || defaultCategoryColour;

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Category name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = { name: name.trim(), icon, colour };
      let categoryId: number;
      // Renaming or removing subcategories changes what items display.
      let itemsAffected = false;
      if (isEdit && category) {
        await updateCategory(category.id, payload);
        categoryId = category.id;
        itemsAffected = payload.name !== category.name;

        const keptSubIds = new Set(subs.map((s) => s.id).filter((id) => id !== undefined));
        for (const sub of category.subCategories) {
          if (!keptSubIds.has(sub.id)) {
            await deleteSubCategory(sub.id);
            itemsAffected = true;
          }
        }

        const keptTagIds = new Set(tagChips.map((t) => t.id).filter((id) => id !== undefined));
        for (const tag of category.tags ?? []) {
          if (!keptTagIds.has(tag.id)) await detachTag(category.id, tag.id);
        }
      } else {
        const created = await createCategory(payload);
        categoryId = created.id;
      }

      for (const sub of subs) {
        if (sub.id === undefined) await createSubCategory(categoryId, sub.name);
      }
      for (const tag of tagChips) {
        if (tag.id === undefined) await attachTag(categoryId, tag.name);
      }

      onSaved({ categories: true, items: itemsAffected });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save category");
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
      <div className="flex h-full w-full flex-col bg-cute-bg sm:h-auto sm:max-h-[90vh] sm:max-w-[460px] sm:rounded-cute-l sm:bg-cute-surface sm:shadow-[0_16px_40px_-8px_rgba(74,63,85,0.19)]">
        <div className="flex w-full items-center gap-3.5 px-5 pt-5 pb-3 sm:items-start sm:justify-between sm:p-8 sm:pb-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Go back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cute-surface-alt text-cute-text transition hover:brightness-95 sm:hidden"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex min-w-0 flex-1 flex-col sm:gap-1">
            <h2 className="truncate font-heading text-xl font-semibold text-cute-text sm:text-[22px]">
              {isEdit ? "Edit Category" : "Add Category"}
            </h2>
            <p className="hidden font-body text-[13px] text-cute-text-muted sm:block">
              {isEdit
                ? `Update how ${category?.name ?? name} looks and organizes your things`
                : "Create a new category for your things"}
            </p>
          </div>
          {isEdit && category && (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="shrink-0 px-1 font-body text-[13px] font-semibold text-cute-danger transition hover:opacity-80 sm:hidden"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="hidden h-9 w-9 items-center justify-center rounded-full bg-cute-surface-alt text-cute-text transition hover:brightness-95 sm:flex"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex w-full flex-1 flex-col gap-[22px] overflow-y-auto px-5 py-4 sm:flex-none sm:p-8 sm:pt-5">
        <div className="flex w-full flex-col items-center gap-1.5">
          <CategoryBadge
            iconSrc={icon ? undefined : iconSrc}
            iconName={icon || undefined}
            colour={previewColour}
            size={88}
          />
          <p className="font-body text-xs text-cute-text-muted">Live Preview</p>
        </div>

        <label className="flex w-full flex-col gap-1.5">
          <FieldLabel>Category Name</FieldLabel>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Food"
            autoFocus={!isEdit}
            className="w-full rounded-full border border-cute-border bg-cute-surface-alt px-[22px] py-4 font-body text-sm text-cute-text outline-none transition focus:border-cute-primary"
          />
        </label>

        <div className="flex w-full flex-col gap-2.5">
          <FieldLabel>Icon</FieldLabel>
          <div className="flex flex-wrap items-center gap-[9px]">
            {iconSrc && (
              <button
                type="button"
                aria-label="Keep category image"
                onClick={() => setIcon("")}
                className={`flex h-[38px] w-[38px] items-center justify-center overflow-hidden rounded-full transition ${
                  icon === "" ? "ring-2 ring-cute-text" : "opacity-70 hover:opacity-100"
                }`}
              >
                <img src={iconSrc} alt="" className="h-full w-full object-cover" />
              </button>
            )}
            {Object.entries(categoryIconOptions).map(([iconName, Icon]) => {
              const selected = icon === iconName;
              return (
                <button
                  key={iconName}
                  type="button"
                  aria-label={`Icon ${iconName}`}
                  onClick={() => setIcon(iconName)}
                  className={`flex h-[38px] w-[38px] items-center justify-center rounded-full transition ${
                    selected
                      ? "bg-cute-accent text-cute-accent-foreground ring-2 ring-cute-text"
                      : "bg-cute-surface-alt text-cute-text-muted hover:brightness-95"
                  }`}
                >
                  <Icon size={18} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex w-full flex-col gap-2.5">
          <FieldLabel>Background Color</FieldLabel>
          <div className="flex flex-wrap items-center gap-2.5">
            {swatches.map((swatch) => {
              const selected = (colour || category?.colour) === swatch;
              return (
                <button
                  key={swatch}
                  type="button"
                  aria-label={`Colour ${swatch}`}
                  onClick={() => setColour(swatch)}
                  style={{ backgroundColor: swatch }}
                  className={`h-8 w-8 rounded-full transition ${
                    selected
                      ? "ring-2 ring-cute-text"
                      : "ring-1 ring-cute-border hover:brightness-95"
                  }`}
                />
              );
            })}
          </div>
        </div>

        <div className="flex w-full flex-col gap-2.5">
          <FieldLabel>Subcategories</FieldLabel>
          <div className="flex w-full flex-wrap items-center gap-2">
            {subs.map((sub) => (
              <Chip key={sub.id ?? sub.name} chip={sub} onRemove={() => removeChip(setSubs)(sub)} />
            ))}
            <InlineAdd
              label="Add Subcategory"
              placeholder="Subcategory name"
              onAdd={addChip(setSubs)}
            />
          </div>
        </div>

        <div className="flex w-full flex-col gap-2.5">
          <FieldLabel>Tags</FieldLabel>
          <div className="flex w-full flex-wrap items-center gap-2">
            {tagChips.map((tag) => (
              <Chip
                key={tag.id ?? tag.name}
                chip={tag}
                coloured
                onRemove={() => removeChip(setTagChips)(tag)}
              />
            ))}
            <InlineAdd label="Add Tag" placeholder="Tag name" onAdd={addChip(setTagChips)} />
          </div>
        </div>

        {error && <p className="font-body text-sm text-cute-danger">{error}</p>}
        </div>

        <div className="w-full border-t border-cute-border bg-cute-surface px-5 pt-3.5 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:border-0 sm:bg-transparent sm:px-8 sm:pt-0 sm:pb-8">
          <div className="flex w-full items-center justify-between">
            {isEdit && category ? (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="hidden items-center gap-1.5 px-1 py-2.5 font-body text-[13px] font-semibold text-cute-danger transition hover:opacity-80 sm:flex"
              >
                <Trash2 size={14} />
                Delete Category
              </button>
            ) : (
              <span className="hidden sm:block" />
            )}
            <div className="flex w-full items-center gap-3 sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="hidden items-center justify-center rounded-full border border-cute-border px-4 py-2.5 font-body text-sm font-medium text-cute-text transition hover:bg-cute-surface-alt sm:flex"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-cute-primary px-4 py-[13px] font-body text-sm font-semibold text-cute-primary-foreground transition hover:brightness-105 disabled:opacity-60 sm:flex-none sm:py-2.5"
              >
                <Check size={16} />
                {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Category"}
              </button>
            </div>
          </div>
        </div>
      </div>
      {confirmingDelete && category && (
        <ConfirmDeleteModal
          title={`Delete "${category.name}"?`}
          message="Its subcategories are removed too; items keep existing but lose this category."
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={async () => {
            await deleteCategory(category.id);
            setConfirmingDelete(false);
            onSaved({ categories: true, items: true });
            onClose();
          }}
        />
      )}
    </div>
  );
}
