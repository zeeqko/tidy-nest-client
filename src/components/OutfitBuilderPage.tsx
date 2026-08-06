import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { MobileTopBar } from "./MobileTopBar";
import { FilterPill } from "./FilterPill";
import { OutfitItemPicker } from "./OutfitItemPicker";
import { OutfitCanvas } from "./OutfitCanvas";
import { createLook } from "../api/looks";
import { seedOccasions } from "../data/occasions";
import type { OrganizingItem } from "../types";

/** Default footprint given to every newly-added piece; the interactive
 *  drag/resize/rotate canvas (T4) is what lets the user actually change
 *  these. Staggered per add so pieces don't land in an identical spot. */
const DEFAULT_SIZE = 180;
const STAGGER = 18;

/** A single inventory item placed into the look-in-progress, shaped like the
 *  eventual `POST /api/looks` payload (`itemId` + transform) from day one,
 *  plus just enough source-item data to render it (name, photo, icon
 *  fallback) without a second lookup. */
export interface PlacedItem {
  /** Stable per-placement id (distinct from `itemId`, which can repeat if
   *  the same inventory item is placed on the canvas more than once) — every
   *  selection/removal/transform-update path keys off this, never array
   *  index, since two independent UI surfaces (the canvas toolbar and the
   *  chip list below it) can each remove/select a different placed item and
   *  must not silently drift onto the wrong one after the array reshuffles. */
  id: string;
  itemId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  name: string;
  imageURL?: string;
  cutoutURL?: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
}

/** Outfit Builder page shell: header, interactive Konva arrange-canvas
 *  (`OutfitCanvas`), item picker, and the name + occasion + save footer. */
export function OutfitBuilderPage() {
  const navigate = useNavigate();
  const [pickedItems, setPickedItems] = useState<PlacedItem[]>([]);
  const [name, setName] = useState("");
  const [occasion, setOccasion] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0 && pickedItems.length > 0 && !saving;

  const goToStyleBook = () => navigate("/stylebook");

  const addItem = (item: OrganizingItem) => {
    setPickedItems((prev) => {
      const zIndex = prev.length > 0 ? Math.max(...prev.map((placed) => placed.zIndex)) + 1 : 1;
      const offset = (zIndex - 1) * STAGGER;
      const next: PlacedItem = {
        id: crypto.randomUUID(),
        itemId: item.id,
        x: 24 + offset,
        y: 24 + offset,
        width: DEFAULT_SIZE,
        height: DEFAULT_SIZE,
        rotation: 0,
        zIndex,
        name: item.name,
        imageURL: item.imageURL,
        cutoutURL: item.cutoutURL,
        icon: item.icon,
        iconBg: item.iconBg,
        iconColor: item.iconColor,
      };
      return [...prev, next];
    });
  };

  const removeItem = (id: string) => {
    setPickedItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateItemTransform = (
    id: string,
    patch: Pick<PlacedItem, "x" | "y" | "width" | "height" | "rotation">,
  ) => {
    setPickedItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const reorderItem = (id: string, direction: "front" | "back") => {
    setPickedItems((prev) => {
      const zIndices = prev.map((item) => item.zIndex);
      const targetZ = direction === "front" ? Math.max(...zIndices) + 1 : Math.min(...zIndices) - 1;
      return prev.map((item) => (item.id === id ? { ...item, zIndex: targetZ } : item));
    });
  };

  const toggleOccasion = (value: string) => {
    setOccasion((current) => (current === value ? "" : value));
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      await createLook({
        name: trimmedName,
        occasion,
        items: pickedItems.map(({ itemId, x, y, width, height, rotation, zIndex }) => ({
          itemId,
          x,
          y,
          width,
          height,
          rotation,
          zIndex,
        })),
      });
      goToStyleBook();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save your look");
      setSaving(false);
    }
  };

  return (
    <div className="w-full px-5 pt-2 pb-10 sm:px-10">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 sm:gap-9">
        <MobileTopBar title="Create a Look" backTo="/stylebook" />

        <div className="hidden sm:block">
          <div className="flex w-full items-start justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="font-heading text-2xl font-semibold text-cute-text">Create a Look</h1>
              <p className="font-body text-sm text-cute-text-muted">
                Pick pieces from your closet to build an outfit
              </p>
            </div>
            <button
              type="button"
              onClick={goToStyleBook}
              aria-label="Close"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cute-surface-alt text-cute-text transition hover:brightness-95"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex w-full flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
          <div className="flex w-full flex-col gap-3 sm:w-[440px] sm:shrink-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-heading text-sm font-semibold text-cute-text sm:text-base">
                Your Look
              </h2>
              {pickedItems.length > 0 && (
                <p className="font-body text-xs text-cute-text-muted">
                  {pickedItems.length} {pickedItems.length === 1 ? "piece" : "pieces"} added
                </p>
              )}
            </div>
            <OutfitCanvas
              items={pickedItems}
              onChangeTransform={updateItemTransform}
              onReorder={reorderItem}
              onRemove={removeItem}
            />
            {pickedItems.length > 0 && (
              <div className="flex w-full flex-wrap gap-2">
                {pickedItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-1.5 rounded-full border border-cute-border bg-cute-surface py-1 pr-2.5 pl-1"
                    >
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full"
                        style={{ backgroundColor: item.iconBg }}
                      >
                        {item.imageURL ? (
                          <img src={item.imageURL} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Icon size={12} color={item.iconColor} />
                        )}
                      </span>
                      <span className="max-w-[100px] truncate font-body text-xs text-cute-text">
                        {item.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        aria-label={`Remove ${item.name}`}
                        className="flex shrink-0 items-center justify-center text-cute-text-muted transition hover:text-cute-danger"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <OutfitItemPicker onAdd={addItem} />
          </div>
        </div>

        <div className="flex w-full flex-col gap-4 border-t border-cute-border pt-4 sm:pt-6">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="look-name"
              className="hidden font-body text-sm font-medium text-cute-text sm:block"
            >
              Look Name
            </label>
            <input
              id="look-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name your look"
              className="w-full rounded-full border border-cute-border bg-cute-surface px-[18px] py-3.5 font-body text-sm text-cute-text placeholder:text-cute-text-muted focus:border-cute-primary focus:outline-none"
            />
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2.5">
              {seedOccasions.map((value) => (
                <FilterPill
                  key={value}
                  label={value}
                  active={occasion === value}
                  onClick={() => toggleOccasion(value)}
                  size="sm"
                />
              ))}
            </div>
            <button
              type="button"
              disabled={!canSave}
              onClick={handleSave}
              className="flex w-full items-center justify-center gap-1.5 rounded-full bg-cute-primary px-5 py-3.5 font-body text-sm font-semibold text-cute-primary-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100 sm:w-auto"
            >
              <Check size={16} />
              {saving ? "Saving…" : "Save to Style Book"}
            </button>
          </div>

          {saveError && (
            <p className="font-body text-sm text-cute-danger">{saveError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
