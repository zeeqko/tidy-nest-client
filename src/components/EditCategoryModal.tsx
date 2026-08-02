import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Trash2, X } from "lucide-react";
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
import { illustrationIcons } from "../data/categories";
import { categoryIconOptions, defaultCategoryColour } from "../data/categoryIcons";
import { tagChip } from "../data/presentation";
import type { RefreshScope } from "../types";
import { CategoryBadge } from "./CategoryBadge";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { InlineAdd } from "./InlineAdd";
import { ModalShell } from "./ModalShell";

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
  // Seeds with whatever the category's icon actually is — an illustration
  // key (e.g. "food") or a lucide key — since the picker below offers both
  // kinds of choice and CategoryBadge resolves either by name.
  const [icon, setIcon] = useState(category?.icon ?? "");
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
  const nameInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // Escape/backdrop no-ops while the nested delete confirmation is open —
  // enforced via ModalShell's `closeGuard`.
  const closeGuard = useCallback(() => !confirmingDelete, [confirmingDelete]);

  // Focus the name input in create mode without letting the browser scroll
  // any ancestor (e.g. Edit Categories' list underneath) into view for it.
  useEffect(() => {
    if (!isEdit) nameInputRef.current?.focus({ preventScroll: true });
  }, [isEdit]);

  // The error text lives at the bottom of the scrollable body — bring it into
  // view whenever it appears so it isn't silently invisible.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [error]);

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
          if (!keptTagIds.has(tag.id)) {
            await detachTag(category.id, tag.id);
            itemsAffected = true;
          }
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
    <>
    <ModalShell
      level="elevated"
      onClose={onClose}
      closeGuard={closeGuard}
      maxWidthClassName="sm:max-w-[460px]"
      bodyClassName="gap-[22px] px-5 py-4 sm:p-8 sm:pt-5"
      title={isEdit ? "Edit Category" : "Add Category"}
      subtitle={
        isEdit
          ? `Update how ${category?.name ?? name} looks and organizes your things`
          : "Create a new category for your things"
      }
      footer={
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {isEdit && category ? (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="flex items-center gap-1.5 self-start px-1 py-2.5 font-body text-[13px] font-semibold text-cute-destructive transition hover:opacity-80"
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
      }
    >
        <div className="flex w-full flex-col items-center gap-1.5">
          <CategoryBadge iconName={icon || undefined} colour={previewColour} size={88} />
          <p className="font-body text-xs text-cute-text-muted">Live Preview</p>
        </div>

        <label className="flex w-full flex-col gap-1.5">
          <FieldLabel>Category Name</FieldLabel>
          <input
            ref={nameInputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Food"
            className="w-full rounded-full border border-cute-border bg-cute-surface-alt px-[22px] py-4 font-body text-sm text-cute-text outline-none transition focus:border-cute-primary"
          />
        </label>

        <div className="flex w-full flex-col gap-2.5">
          <FieldLabel>Icon</FieldLabel>
          <div className="flex flex-wrap items-center gap-[9px]">
            {Object.entries(illustrationIcons).map(([iconName, src]) => {
              const selected = icon === iconName;
              return (
                <button
                  key={iconName}
                  type="button"
                  aria-label={`Illustration ${iconName}`}
                  onClick={() => setIcon(iconName)}
                  className={`flex h-[38px] w-[38px] items-center justify-center overflow-hidden rounded-full transition ${
                    selected ? "ring-2 ring-cute-text" : "opacity-70 hover:opacity-100"
                  }`}
                >
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              );
            })}
            <span className="h-[26px] w-px shrink-0 bg-cute-border" aria-hidden="true" />
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

        {error && (
          <p ref={errorRef} className="font-body text-sm text-cute-danger">
            {error}
          </p>
        )}
      </ModalShell>
      {/* Rendered as a sibling, not nested, so its own ModalShell overlay
          (level="alert") paints above this one at the shared z-scale. */}
      {confirmingDelete && category && (
        <ConfirmDeleteModal
          title={`Delete "${category.name}"?`}
          message={
            category.itemCount > 0
              ? `This permanently deletes its subcategories and all ${category.itemCount} item${category.itemCount === 1 ? "" : "s"} in it. This can't be undone.`
              : "This permanently deletes its subcategories. This can't be undone."
          }
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={async () => {
            try {
              await deleteCategory(category.id);
              setConfirmingDelete(false);
              onSaved({ categories: true, items: true });
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to delete category");
              setConfirmingDelete(false);
            }
          }}
        />
      )}
    </>
  );
}
