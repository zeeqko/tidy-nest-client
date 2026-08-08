import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, Loader2, X } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MobileTopBar } from "./MobileTopBar";
import { FilterPill } from "./FilterPill";
import { OutfitItemPicker } from "./OutfitItemPicker";
import { OutfitCanvas, DEFAULT_SIZE } from "./OutfitCanvas";
import { createLook, updateLook, type NewLook } from "../api/looks";
import { useLook } from "../hooks/useLook";
import { seedOccasions } from "../data/occasions";
import { generateItemCutout } from "../lib/itemCutout";
import { toPlacedItems } from "../lib/lookPlacements";
import type { OrganizingItem } from "../types";

/** `DEFAULT_SIZE` (the square footprint every newly-added piece starts at) is
 *  defined in and imported from `OutfitCanvas` — that's also where T4's
 *  aspect-ratio fit reads it, to detect whether a placement is still
 *  untouched. The interactive drag/resize/rotate canvas is what lets the
 *  user actually change these. Staggered per add so pieces don't land in an
 *  identical spot. */
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
 *  (`OutfitCanvas`), item picker, and the name + occasion + save footer.
 *
 *  Doubles as the edit flow (PLAN.md T2) when mounted at `/stylebook/:id/edit`
 *  — `useParams` supplies the optional `id`; without one this behaves exactly
 *  as the create flow always has. With an id, the existing look is loaded via
 *  `useLook` and its name/occasion/canvas placements are prefilled once via
 *  `toPlacedItems` (decision 4's shared mapping) — never through `addItem`,
 *  so loading a look for edit can't kick off the cutout pipeline (decision
 *  6). Loading/error/not-found states mirror `LookDetailPage`'s copy and
 *  structure so an unknown or another user's id renders a proper not-found
 *  block instead of a blank builder. */
export function OutfitBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const { look, loading: lookLoading, error: lookError } = useLook(id);
  const [pickedItems, setPickedItems] = useState<PlacedItem[]>([]);
  const [name, setName] = useState("");
  const [occasion, setOccasion] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Prefills the form from the loaded look exactly once — `useLook` only
  // refetches if `id` itself changes, so guarding with a ref (rather than
  // just depending on `look`) keeps a later `refresh()` (none fires here
  // today, but this stays correct if one ever does) from clobbering
  // in-progress edits.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (!look || prefilledRef.current) return;
    prefilledRef.current = true;
    setName(look.name);
    setOccasion(look.occasion);
    // Directly sets the placements from the saved shape — deliberately not
    // routed through `addItem`, which is the only path allowed to kick off
    // the cutout pipeline (decision 6).
    setPickedItems(toPlacedItems(look.items));
  }, [look]);

  // Cutout pipeline state (PLAN.md T2), scoped to this builder session (not
  // module-scoped) so it can't survive navigating away and back:
  // - `cutoutAttemptedRef` dedupes per `itemId` — set the moment a pipeline
  //   is kicked off and never cleared, so a re-tap of the same tile (whether
  //   the pipeline is still in flight or already finished) never starts a
  //   second inference/upload/PUT (decision 6).
  // - the `pendingCutoutItemIds` / `failedCutoutItemIds` values (itemIds
  //   currently in flight, and itemIds whose pipeline didn't fully succeed)
  //   drive the T3 UI below: a pending state on the placed-piece chip while
  //   an itemId is in `pendingCutoutItemIds`, and a single non-blocking
  //   failure note whenever `failedCutoutItemIds` is non-empty.
  const cutoutAttemptedRef = useRef<Set<string>>(new Set());
  // itemId -> cutoutURL for pipelines that already resolved this session.
  // `onCutoutReady` only patches placements that exist *at the moment it
  // fires* — a placement created later (the same item tapped again after
  // its cutout already resolved) needs this cache, since the picker's own
  // item copy is deliberately left stale for the session (see the module
  // comment on `OutfitItemPicker`) and can't be relied on for this.
  const resolvedCutoutsRef = useRef<Map<string, string>>(new Map());
  const [pendingCutoutItemIds, setPendingCutoutItemIds] = useState<Set<string>>(new Set());
  const [failedCutoutItemIds, setFailedCutoutItemIds] = useState<Set<string>>(new Set());
  // Flips on unmount so an in-flight pipeline's `.then` becomes a no-op
  // instead of calling setState on an unmounted component. Reset to `false`
  // at the top of the effect body (not just declared `false` once via
  // `useRef`): React 18 StrictMode's dev-only mount → cleanup → remount
  // cycle runs this cleanup once against the *same* component instance
  // before the "real" mount, so without the reset here the flag would be
  // stuck `true` for the rest of the component's actual lifetime and every
  // pipeline callback would silently no-op from the very first tap.
  const unmountedRef = useRef(false);
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0 && pickedItems.length > 0 && !saving;

  // Cancel/close targets land back on the look's own detail page when
  // editing, and the Style Book when creating.
  const backTarget = isEditing && id ? `/stylebook/${id}` : "/stylebook";
  const goBack = () => navigate(backTarget);

  const startCutoutPipeline = (item: OrganizingItem) => {
    // Skip: no photo to work from (decision 9), already has a cutout
    // (decision 4), or already cached-or-in-flight this session (decision 6).
    if (!item.imageURL || item.cutoutURL) return;
    if (cutoutAttemptedRef.current.has(item.id)) return;
    cutoutAttemptedRef.current.add(item.id);
    setPendingCutoutItemIds((prev) => new Set(prev).add(item.id));

    // `onCutoutReady` fires as soon as the upload succeeds, before the
    // persist step, so the canvas swaps over without waiting on the
    // (possibly slow, possibly failing) backfill PUT.
    generateItemCutout(item.id, item.imageURL, (cutoutURL) => {
      resolvedCutoutsRef.current.set(item.id, cutoutURL);
      if (unmountedRef.current) return;
      // Patch every placement of this inventory item, not just the one that
      // triggered the pipeline — it may be placed on the canvas more than
      // once. Zero matches (removed meanwhile) is a normal no-op.
      setPickedItems((prev) =>
        prev.map((placed) => (placed.itemId === item.id ? { ...placed, cutoutURL } : placed)),
      );
    }).then((result) => {
      if (unmountedRef.current) return;
      setPendingCutoutItemIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      // Two sub-cases collapse onto the same non-blocking failure signal
      // (decision 7): `!result.ok` (generation or upload failed, so there
      // was never a cutout to swap in) and `result.ok && !result.persisted`
      // (the swap happened, but the backfill PUT didn't) both mean "note the
      // user, but don't touch the placement further".
      if (!result.ok || !result.persisted) {
        setFailedCutoutItemIds((prev) => new Set(prev).add(item.id));
      }
    });
  };

  const addItem = (item: OrganizingItem) => {
    // A cutout resolved earlier this session (this placement's own pipeline
    // run, or an identical item placed and resolved before this tap) beats
    // the picker's own possibly-stale `item.cutoutURL` copy.
    const cutoutURL = resolvedCutoutsRef.current.get(item.id) ?? item.cutoutURL;
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
        cutoutURL,
        icon: item.icon,
        iconBg: item.iconBg,
        iconColor: item.iconColor,
      };
      return [...prev, next];
    });
    startCutoutPipeline(item);
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
    // Built explicitly (never by spreading an `ApiLook`) per decision 5 —
    // `name`/`imageURL`/`cutoutURL` on each item are response-only and must
    // not be sent back on write. Same shape for both create and edit.
    const payload: NewLook = {
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
    };
    try {
      if (isEditing && id) {
        await updateLook(id, payload);
        navigate(`/stylebook/${id}`);
      } else {
        await createLook(payload);
        navigate("/stylebook");
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save your look");
      setSaving(false);
    }
  };

  if (isEditing) {
    if (lookLoading) {
      return (
        <div className="flex min-h-[60vh] w-full items-center justify-center">
          <p className="font-body text-sm text-cute-text-muted">Loading look…</p>
        </div>
      );
    }

    if (!look) {
      if (lookError && lookError !== "look not found") {
        return (
          <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="font-body text-sm text-cute-danger">
              Couldn't load this look from the server: {lookError}
            </p>
            <Link to="/stylebook" className="font-body text-sm font-semibold text-cute-primary hover:underline">
              Back to Style Book
            </Link>
          </div>
        );
      }
      return (
        <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="font-heading text-xl font-semibold text-cute-text">Look not found</p>
          <p className="font-body text-sm text-cute-text-muted">
            This look may have been deleted, or the link isn't right.
          </p>
          <Link to="/stylebook" className="font-body text-sm font-semibold text-cute-primary hover:underline">
            Back to Style Book
          </Link>
        </div>
      );
    }
  }

  return (
    <div className="w-full px-5 pt-2 pb-10 sm:px-10">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 sm:gap-9">
        <MobileTopBar title={isEditing ? "Edit Look" : "Create a Look"} backTo={backTarget} />

        <div className="hidden sm:block">
          <div className="flex w-full items-start justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="font-heading text-2xl font-semibold text-cute-text">
                {isEditing ? "Edit Look" : "Create a Look"}
              </h1>
              <p className="font-body text-sm text-cute-text-muted">
                {isEditing
                  ? "Update your pieces, name, or occasion"
                  : "Pick pieces from your closet to build an outfit"}
              </p>
            </div>
            <button
              type="button"
              onClick={goBack}
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
                  // Pending state is keyed by `itemId` (the inventory item),
                  // not `item.id` (this placement) — the same inventory item
                  // placed twice shares one in-flight pipeline, so both chips
                  // show the pending state together.
                  const isPending = pendingCutoutItemIds.has(item.itemId);
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-1.5 rounded-full border border-cute-border bg-cute-surface py-1 pr-2.5 pl-1"
                    >
                      <span
                        className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full"
                        style={{ backgroundColor: item.iconBg }}
                      >
                        {item.imageURL ? (
                          <img src={item.imageURL} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Icon size={12} color={item.iconColor} />
                        )}
                        {isPending && (
                          <span className="absolute inset-0 flex items-center justify-center bg-cute-text/60">
                            <Loader2 size={12} className="animate-spin text-white" aria-hidden="true" />
                          </span>
                        )}
                      </span>
                      <span className="max-w-[100px] truncate font-body text-xs text-cute-text">
                        {isPending ? "Removing…" : item.name}
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
            {failedCutoutItemIds.size > 0 && (
              <p className="font-body text-xs text-cute-warning-foreground">
                Couldn't remove the background for one of your pieces — it's on the canvas with
                its original photo.
              </p>
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
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Save to Style Book"}
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
