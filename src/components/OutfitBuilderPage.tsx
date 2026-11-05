import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import type { LucideIcon } from "lucide-react";
import { Redo2, Undo2, X } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MobileTopBar } from "./MobileTopBar";
import { OutfitCanvas, type TransformPatch } from "./OutfitCanvas";
import { StylebookPicker } from "./StylebookPicker";
import { SaveLookSheet } from "./SaveLookSheet";
import { refreshLooksBounded } from "../hooks/useLooks";
import { useCategories } from "../hooks/useCategories";
import { useLookEditor } from "../hooks/useLookEditor";
import { createLook, updateLook, type NewLook } from "../api/looks";
import { useLook } from "../hooks/useLook";
import { seedOccasions } from "../data/occasions";
import { DESIGN_HEIGHT, DESIGN_WIDTH, type Rect } from "../lib/canvasSpace";
import { createCutoutQueue } from "../lib/cutoutQueue";
import { loadImageAspect } from "../lib/imageAspect";
import { placeItem, startingZIndex } from "../lib/placement";
import { buildGroupMap } from "../lib/pickerModel";
import { countsByItemId, lastPlacementId } from "../lib/placementCounts";
import { createSerialChain } from "../lib/serialChain";
import { toPlacedItems } from "../lib/lookPlacements";
import { autoLookName } from "../lib/lookName";
import type { OrganizingItem } from "../types";

/** Nothing overlays the canvas, so new pieces are placed against the whole
 *  400x711 logical space. */
const PLACEMENT_AREA: Rect = { x: 0, y: 0, width: DESIGN_WIDTH, height: DESIGN_HEIGHT };

/** Height of the canvas + picker panels: the viewport minus the page chrome
 *  around them, so the page fits the viewport exactly (no page scroll).
 *  Phones (below `sm`): 11.75rem = the page's top padding (0.5rem) + the
 *  back-button top bar (4.25rem) + the gap (1rem) + AppLayout's `pb-24`
 *  reserved for the fixed bottom nav (6rem), plus the safe-area insets.
 *  `sm` and up: 13.25rem = the brand bar (5.5rem) + top padding (0.5rem) +
 *  the title row (3.5rem) + gap-9 (2.25rem) + the page's `sm:pb-6` (1.5rem).
 *  Change these together with that chrome. `100vh` is the fallback for
 *  browsers without `dvh`; the `min-h` keeps both panels usable on very short
 *  windows (the page scrolls instead). Save lives in the top bar. */
const PANELS_HEIGHT = [
  "h-[calc(100vh_-_11.75rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))]",
  "supports-[height:100dvh]:h-[calc(100dvh_-_11.75rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))]",
  "sm:h-[calc(100vh_-_13.25rem_-_env(safe-area-inset-top))]",
  "sm:supports-[height:100dvh]:h-[calc(100dvh_-_13.25rem_-_env(safe-area-inset-top))]",
  "min-h-[27rem] lg:min-h-[30rem]",
].join(" ");

/** Below `lg` the picker (stacked under the canvas) never gets shorter than
 *  its controls (group tabs, search, chip row: ~8rem) plus one full tile row
 *  (~6rem at phone widths) and the grid's bottom padding; the canvas panel
 *  (`min-h-0`) absorbs the shortfall. With the 27rem panels floor the canvas
 *  keeps at least ~10.75rem; below that the page scrolls instead (both
 *  panels stay reachable). From `lg` the panels sit side by side. */
const PICKER_MIN_HEIGHT = "min-h-[15.5rem] lg:min-h-0";

const SAVE_PILL =
  "flex h-9 shrink-0 items-center justify-center rounded-full bg-cute-primary px-3 sm:px-4 font-body text-sm font-semibold text-cute-primary-foreground transition hover:brightness-105 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:brightness-100";

const NO_PIECES_HINT = "Add at least one piece";

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

/** Phone variant: one segmented pill (as in the design) so the top bar keeps
 *  room for the title next to Save. */
const COMPACT_UNDO_REDO_BUTTON =
  "flex h-9 w-9 items-center justify-center rounded-full text-cute-text transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40";

function UndoRedoButtons({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  compact,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex shrink-0 items-center rounded-full bg-cute-surface-alt">
        <button type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo" className={COMPACT_UNDO_REDO_BUTTON}>
          <Undo2 size={17} />
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo" className={COMPACT_UNDO_REDO_BUTTON}>
          <Redo2 size={17} />
        </button>
      </div>
    );
  }
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

/** Outfit Builder page: header (undo/redo and the Save pill), then two docked
 *  panels — the 9:16 arrange canvas and the Stylebook picker, side by side
 *  from `lg` and stacked (canvas ~3/5 over picker ~2/5) below it, never
 *  overlapping. Save opens `SaveLookSheet` (name, occasion, save actions).
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
  // `name` only counts once the user has typed (or it was loaded for edit);
  // until then the sheet shows the live auto name instead.
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [occasion, setOccasion] = useState("");
  // Custom occasions added with "＋ New" this session.
  const [customOccasions, setCustomOccasions] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState<"update" | "create" | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Shown for ~3 s when the disabled Save is tapped (a `title` tooltip
  // never appears on touch).
  const [noPiecesHint, setNoPiecesHint] = useState(false);
  const noPiecesTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(noPiecesTimerRef.current), []);
  const mobileSaveRef = useRef<HTMLButtonElement>(null);
  const desktopSaveRef = useRef<HTMLButtonElement>(null);
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
    setNameEdited(true);
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

  const groupMap = useMemo(() => buildGroupMap(categories), [categories]);
  const counts = useMemo(() => countsByItemId(state.items), [state.items]);

  const hasPieces = state.items.length > 0;
  const autoName = useMemo(
    () => autoLookName(state.items.map((item) => item.name), occasion),
    [state.items, occasion],
  );
  const shownName = nameEdited ? name : autoName;

  // Seed occasions, then the edited look's own (if it isn't a seed), then any
  // added with "＋ New" — deduped case-insensitively, first spelling wins.
  const occasionChips = useMemo(() => {
    const chips: string[] = [];
    const seen = new Set<string>();
    for (const value of [...seedOccasions, look?.occasion ?? "", ...customOccasions]) {
      const key = value.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      chips.push(value.trim());
    }
    return chips;
  }, [look?.occasion, customOccasions]);

  const addOccasion = (value: string) => {
    const existing = occasionChips.find((chip) => chip.toLowerCase() === value.toLowerCase());
    if (!existing) setCustomOccasions((current) => [...current, value]);
    setOccasion(existing ?? value);
  };

  // A newly placed piece makes the hint moot.
  if (hasPieces && noPiecesHint) setNoPiecesHint(false);

  const openSheet = () => {
    if (!hasPieces) {
      setNoPiecesHint(true);
      clearTimeout(noPiecesTimerRef.current);
      noPiecesTimerRef.current = setTimeout(() => setNoPiecesHint(false), 3000);
      return;
    }
    setSaveError(null);
    setSheetOpen(true);
  };

  // Hands focus back to the (visible) top-bar Save once the sheet closes.
  // ModalShell restores the previously focused element too, but a tap on
  // Safari doesn't focus the button, so this doesn't rely on it.
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const sheetWasOpenRef = useRef(false);
  useEffect(() => {
    if (sheetOpen) {
      sheetWasOpenRef.current = true;
      return;
    }
    if (!sheetWasOpenRef.current) return;
    sheetWasOpenRef.current = false;
    const visible = [mobileSaveRef.current, desktopSaveRef.current].find(
      (el) => el && el.getClientRects().length > 0,
    );
    visible?.focus();
  }, [sheetOpen]);

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
        PLACEMENT_AREA,
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

  /** Saves the editor state: `"update"` the open look (edit mode) or
   *  `"create"` a new one (create mode, or "Save as a new look" — which
   *  leaves the original look untouched). Lands on the saved look's detail. */
  const handleSave = async (action: "update" | "create") => {
    if (!hasPieces || saving) return;
    setSaving(action);
    setSaveError(null);
    // Built explicitly (never by spreading an `ApiLook`) — `name`/`imageURL`/
    // `cutoutURL` on each item are response-only and must not be sent back on
    // write. Same shape for both create and edit. Z-indexes are saved as the
    // editor holds them (sparse zone bands) so reopened looks keep their layering.
    const payload: NewLook = {
      // A blank field means "use the suggestion".
      name: shownName.trim() || autoName,
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
      if (action === "update" && isEditing && id) {
        await updateLook(id, payload);
        await refreshLooksBounded();
        if (!mountedRef.current) return;
        navigate(`/stylebook/${id}`);
      } else {
        const created = await createLook(payload);
        await refreshLooksBounded();
        if (!mountedRef.current) return;
        // Replace the builder entry so Back from the new look doesn't land on
        // an empty /stylebook/create (or re-open the editor of the original).
        navigate(`/stylebook/${created.id}`, { replace: true });
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setSaveError(err instanceof Error ? err.message : "Failed to save your look");
      setSaving(null);
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

  const undoRedo = (compact: boolean) => (
    <UndoRedoButtons
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={() => dispatch({ type: "undo" })}
      onRedo={() => dispatch({ type: "redo" })}
      compact={compact}
    />
  );

  // aria-disabled (not `disabled`) keeps it focusable, its tooltip working,
  // and lets a tap show the "Add at least one piece" bubble below it (a
  // live region, so it's announced too).
  const saveButton = (ref: Ref<HTMLButtonElement>) => (
    <div className="relative shrink-0">
      <button
        ref={ref}
        type="button"
        onClick={openSheet}
        aria-disabled={!hasPieces}
        aria-haspopup="dialog"
        title={hasPieces ? undefined : NO_PIECES_HINT}
        className={SAVE_PILL}
      >
        Save
      </button>
      <div role="status" className="pointer-events-none absolute top-full right-0 z-20 mt-2">
        {noPiecesHint && (
          <p className="whitespace-nowrap rounded-full bg-cute-text px-3 py-1.5 font-body text-xs font-semibold text-cute-surface shadow-md">
            {NO_PIECES_HINT}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="w-full px-5 pt-2 sm:px-10 sm:pb-6">
      <div className="mx-auto flex w-full max-w-cute-page 2xl:max-w-cute-page-wide flex-col gap-4 sm:gap-9">
        <MobileTopBar
          title={isEditing ? "Edit Look" : "Create a Look"}
          backTo={backTarget}
          flush
          action={
            <div className="flex shrink-0 items-center gap-1.5">
              {undoRedo(true)}
              {saveButton(mobileSaveRef)}
            </div>
          }
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
              {undoRedo(false)}
              {saveButton(desktopSaveRef)}
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

        <div className={`flex w-full flex-col gap-3 lg:flex-row lg:gap-6 ${PANELS_HEIGHT}`}>
          {/* The canvas fills this panel (absolute, so it always has the
              panel's explicit flex height to measure). */}
          <div
            className="relative min-h-0 w-full flex-[3] overflow-hidden rounded-cute-l border border-cute-border lg:flex-1"
            data-testid="builder-canvas-area"
          >
            <div className="absolute inset-0">
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
              />
            </div>
          </div>
          <div
            className={`w-full flex-[2] ${PICKER_MIN_HEIGHT} lg:w-[28rem] lg:flex-none lg:shrink-0`}
            data-testid="builder-picker-panel"
          >
            <StylebookPicker onAdd={addItem} onUndoLast={undoLast} countsByItemId={counts} />
          </div>
        </div>

        {sheetOpen && (
          <SaveLookSheet
            mode={isEditing ? "edit" : "create"}
            name={shownName}
            isAutoName={!nameEdited}
            autoName={autoName}
            onNameChange={(value) => {
              setName(value);
              setNameEdited(true);
            }}
            occasions={occasionChips}
            occasion={occasion}
            onOccasionChange={setOccasion}
            onAddOccasion={addOccasion}
            saving={saving}
            error={saveError}
            onSave={() => void handleSave(isEditing ? "update" : "create")}
            onSaveAsNew={isEditing ? () => void handleSave("create") : undefined}
            onClose={closeSheet}
          />
        )}
      </div>
    </div>
  );
}
