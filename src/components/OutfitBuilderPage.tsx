import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, Redo2, Undo2, X } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MobileTopBar } from "./MobileTopBar";
import { FilterPill } from "./FilterPill";
import { OutfitCanvas, type TransformPatch } from "./OutfitCanvas";
import { StylebookPicker } from "./StylebookPicker";
import { refreshLooksBounded } from "../hooks/useLooks";
import { useCategories } from "../hooks/useCategories";
import { useLookEditor } from "../hooks/useLookEditor";
import { createLook, updateLook, type NewLook } from "../api/looks";
import { useLook } from "../hooks/useLook";
import { seedOccasions } from "../data/occasions";
import type { Rect } from "../lib/canvasSpace";
import { createCutoutQueue } from "../lib/cutoutQueue";
import { loadImageAspect } from "../lib/imageAspect";
import { placeItem, startingZIndex } from "../lib/placement";
import { buildGroupMap } from "../lib/pickerModel";
import { countsByItemId, lastPlacementId } from "../lib/placementCounts";
import { createSerialChain } from "../lib/serialChain";
import { toPlacedItems } from "../lib/lookPlacements";
import { placementArea } from "../lib/visibleRect";
import type { OrganizingItem } from "../types";

const HEADER_ICON_BUTTON =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cute-surface-alt text-cute-text transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100";

/** A single inventory item placed into the look-in-progress, shaped like the
 *  eventual `POST /api/looks` payload (`itemId` + transform, in the 400x711
 *  logical canvas space) plus just enough source-item data to render it
 *  (name, photo, icon fallback) without a second lookup. */
export interface PlacedItem {
  /** Stable per-placement id (distinct from `itemId`, which repeats when the
   *  same inventory item is placed more than once) — every selection,
   *  removal and transform update keys off this, never array index. */
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

function UndoRedoButtons({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        aria-label="Undo"
        className={HEADER_ICON_BUTTON}
      >
        <Undo2 size={18} />
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        aria-label="Redo"
        className={HEADER_ICON_BUTTON}
      >
        <Redo2 size={18} />
      </button>
    </div>
  );
}

/** Outfit Builder page: header (with undo/redo), the full-height 9:16
 *  arrange canvas with the Stylebook picker sheet overlaying it, and the
 *  name + occasion + save footer below.
 *
 *  Placements live in `useLookEditor` (undo/redo history). Doubles as the
 *  edit flow when mounted at `/stylebook/:id/edit`: the look is loaded via
 *  `useLook` and its placements are loaded into the editor once via
 *  `toPlacedItems` — never through `addItem`, so loading a look for edit
 *  can't kick off the cutout queue. */
export function OutfitBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const { look, loading: lookLoading, error: lookError } = useLook(id);
  const { categories } = useCategories();
  const { state, dispatch, canUndo, canRedo } = useLookEditor();
  const [name, setName] = useState("");
  const [occasion, setOccasion] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pickerHeight, setPickerHeight] = useState(0);
  // Set false on unmount so a user who left during the refresh isn't pulled
  // back, and so a still-pending add doesn't dispatch after unmount.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Prefills the form from the loaded look exactly once — guarding with a
  // ref (rather than just depending on `look`) keeps a later refetch from
  // clobbering in-progress edits.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (!look || prefilledRef.current) return;
    prefilledRef.current = true;
    setName(look.name);
    setOccasion(look.occasion);
    // Deliberately not routed through `addItem`, which is the only path
    // allowed to enqueue cutouts.
    dispatch({ type: "load", items: toPlacedItems(look.items) });
  }, [look, dispatch]);

  // One cutout queue per builder session. Its results never touch placed
  // items (a placement keeps the image it was added with for the whole
  // session); they only feed `resolvedCutoutsRef`, read by later adds of the
  // same inventory item whose picker copy has no `cutoutURL` yet.
  const [cutoutQueue] = useState(() => createCutoutQueue());
  const resolvedCutoutsRef = useRef<Map<string, string>>(new Map());
  useEffect(
    () =>
      cutoutQueue.subscribe((itemId, cutoutURL) => {
        resolvedCutoutsRef.current.set(itemId, cutoutURL);
      }),
    [cutoutQueue],
  );

  // Adds are serialised: each tap starts loading its image aspect right
  // away, but placement + dispatch run one at a time in tap order, so a
  // slower image can't reorder adds and every add sees the previous one's
  // rect when avoiding overlaps.
  const [addChain] = useState(() => createSerialChain());
  // Latest items for the async add step. Updated after each commit, and
  // optimistically by the add step itself so a back-to-back add sees the
  // previous one even before React re-renders.
  const itemsRef = useRef<PlacedItem[]>(state.items);
  useLayoutEffect(() => {
    itemsRef.current = state.items;
  }, [state.items]);
  // Last logical rect the canvas reported as visible above the picker sheet.
  const visibleRectRef = useRef<Rect | null>(null);
  const handleVisibleRectChange = useCallback((rect: Rect) => {
    visibleRectRef.current = rect;
  }, []);
  const handlePickerHeightChange = useCallback((px: number) => setPickerHeight(px), []);

  const groupMap = useMemo(() => buildGroupMap(categories), [categories]);
  const counts = useMemo(() => countsByItemId(state.items), [state.items]);

  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0 && state.items.length > 0 && !saving;

  // Cancel/close targets land back on the look's own detail page when
  // editing, and the Style Book when creating.
  const backTarget = isEditing && id ? `/stylebook/${id}` : "/stylebook";
  const goBack = () => navigate(backTarget);

  const addItem = (item: OrganizingItem) => {
    // Items reaching the picker always belong to a grouped category; the
    // fallback only guards against categories changing mid-session.
    const group = (item.categoryId && groupMap.get(item.categoryId)) || "clothes";
    const subcategory = item.subcategory;
    const cutoutURL = item.cutoutURL || resolvedCutoutsRef.current.get(item.id) || undefined;
    // Starts now (in parallel with any earlier pending add); never rejects
    // and resolves 1 after ~1.5 s at the latest.
    const aspectPromise = loadImageAspect(cutoutURL ?? item.imageURL);

    void addChain.run(async () => {
      const aspect = await aspectPromise;
      if (!mountedRef.current) return;
      const existing = itemsRef.current;
      const placement = placeItem(
        { group, subcategory, aspect },
        existing.map(({ x, y, width, height }) => ({ x, y, width, height })),
        placementArea(visibleRectRef.current),
      );
      const placed: PlacedItem = {
        id: crypto.randomUUID(),
        itemId: item.id,
        ...placement,
        zIndex: startingZIndex(group, subcategory, existing.length),
        name: item.name,
        imageURL: item.imageURL,
        cutoutURL,
        icon: item.icon,
        iconBg: item.iconBg,
        iconColor: item.iconColor,
      };
      itemsRef.current = [...existing, placed];
      dispatch({ type: "add", item: placed });
      cutoutQueue.enqueue(item);
    });
  };

  const undoLast = (itemId: string) => {
    const placementId = lastPlacementId(state.items, itemId);
    if (placementId) dispatch({ type: "remove", id: placementId });
  };

  const toggleOccasion = (value: string) => {
    setOccasion((current) => (current === value ? "" : value));
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    // Built explicitly (never by spreading an `ApiLook`) — `name`/`imageURL`/
    // `cutoutURL` on each item are response-only and must not be sent back on
    // write. Same shape for both create and edit.
    const payload: NewLook = {
      name: trimmedName,
      occasion,
      items: state.items.map(({ itemId, x, y, width, height, rotation, zIndex }) => ({
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
        await refreshLooksBounded();
        if (!mountedRef.current) return;
        navigate(`/stylebook/${id}`);
      } else {
        await createLook(payload);
        await refreshLooksBounded();
        if (!mountedRef.current) return;
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
        <div className="flex min-h-[60dvh] w-full items-center justify-center">
          <p className="font-body text-sm text-cute-text-muted">Loading look…</p>
        </div>
      );
    }

    if (!look) {
      if (lookError && lookError !== "look not found") {
        return (
          <div className="flex min-h-[60dvh] w-full flex-col items-center justify-center gap-3 px-6 text-center">
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
        <div className="flex min-h-[60dvh] w-full flex-col items-center justify-center gap-3 px-6 text-center">
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

  const undoRedo = (
    <UndoRedoButtons
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={() => dispatch({ type: "undo" })}
      onRedo={() => dispatch({ type: "redo" })}
    />
  );

  return (
    <div className="w-full px-5 pt-2 pb-10 sm:px-10">
      <div className="mx-auto flex w-full max-w-cute-page 2xl:max-w-cute-page-wide flex-col gap-4 sm:gap-9">
        <MobileTopBar
          title={isEditing ? "Edit Look" : "Create a Look"}
          backTo={backTarget}
          action={undoRedo}
        />

        <div className="hidden sm:block">
          <div className="flex w-full items-start justify-between gap-4">
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
            <div className="flex shrink-0 items-center gap-2">
              {undoRedo}
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
        </div>

        {/* Explicit height: the canvas is h-full and the picker sheet is
            absolute bottom-0 inside this box. Mobile subtracts the top bar
            and the fixed bottom nav; desktop the brand bar and title row. */}
        <div
          className="relative h-[calc(100dvh-11rem)] min-h-[28rem] w-full overflow-hidden rounded-cute-l border border-cute-border sm:h-[calc(100dvh-13rem)]"
          data-testid="builder-canvas-area"
        >
          <OutfitCanvas
            items={state.items}
            selectedId={state.selectedId}
            onSelect={(placementId) => dispatch({ type: "select", id: placementId })}
            onChangeTransform={(placementId, patch: TransformPatch) =>
              dispatch({ type: "update", id: placementId, patch })
            }
            onReorder={(placementId, direction) =>
              dispatch({ type: "reorder", id: placementId, direction })
            }
            onCopy={(placementId) =>
              dispatch({ type: "copy", id: placementId, newId: crypto.randomUUID() })
            }
            onRemove={(placementId) => dispatch({ type: "remove", id: placementId })}
            visibleBottomInset={pickerHeight}
            onVisibleRectChange={handleVisibleRectChange}
          />
          <StylebookPicker
            onAdd={addItem}
            onUndoLast={undoLast}
            countsByItemId={counts}
            onHeightChange={handlePickerHeightChange}
          />
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
