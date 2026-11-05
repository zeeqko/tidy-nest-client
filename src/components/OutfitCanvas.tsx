import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type Konva from "konva";
import { Image as KonvaImage, Layer, Rect, Stage, Transformer } from "react-konva";
import { ArrowDownToLine, ArrowUpToLine, Copy, Shirt, X } from "lucide-react";
import type { PlacedItem } from "./OutfitBuilderPage";
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  clampItem,
  fitRectToScreen,
  fitToScreen,
  rotatedBounds,
  type Rect as LogicalRect,
} from "../lib/canvasSpace";
import { CROSS_HIT_SIZE, crossButtonPosition } from "../lib/crossButton";
import { shouldDeleteOnKey } from "../lib/canvasKeyboard";

/** Every placed item's (x, y, width, height) lives in the fixed
 *  DESIGN_WIDTH x DESIGN_HEIGHT (400x711, 9:16) logical space from
 *  `canvasSpace`. The Stage itself fills its container (full-screen in the
 *  builder); `fitToScreen` maps the logical space into it with a uniform
 *  scale plus a centring offset (letterboxed). Resizing the window or
 *  rotating the device only changes that scale/offset, never item positions. */
const MIN_SIZE = 24;

/** Pointer travel (px) before a press on a piece becomes a drag, so a tap
 *  with a little finger jitter stays a tap instead of a (no-op) move. */
const DRAG_DISTANCE = 4;

/** Phones/tablets: the Transformer anchors are the only resize/rotate
 *  control, so make them finger-sized there. Evaluated once; environments
 *  without `matchMedia` (SSR, unit tests) count as fine pointers. */
const COARSE_POINTER =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;
const ANCHOR_SIZE = COARSE_POINTER ? 20 : 10;
// Default rotate-handle offset (50) can land off-stage for pieces near the
// top edge; a smaller offset keeps it reachable while clear of the corner
// anchors (pushed out a little with the larger touch anchors so the two
// never touch).
const ROTATE_ANCHOR_OFFSET = COARSE_POINTER ? 24 : 16;

/** Dotted backdrop drawn behind the (transparent) Stage, across the whole
 *  stage area including any letterbox margins. */
const DOTTED_BACKGROUND = {
  backgroundImage: "radial-gradient(var(--color-cute-border) 1.5px, transparent 1.5px)",
  backgroundSize: "18px 18px",
} as const;

/** Konva node name of the interactive mode's board (the white framed
 *  400x711 area pieces are kept inside). It is not a placed piece. */
const BOARD_NODE_NAME = "board";
const BOARD_FILL = "#ffffff";
/** `--color-cute-border`, darkened a touch so the frame reads on the dots. */
const BOARD_STROKE = "#DCC9C5";

export type TransformPatch = Pick<PlacedItem, "x" | "y" | "width" | "height" | "rotation">;

export interface OutfitCanvasProps {
  items: PlacedItem[];
  selectedId: string | null;
  onSelect(id: string | null): void;
  onChangeTransform(id: string, patch: TransformPatch): void;
  onReorder(id: string, direction: "front" | "back"): void;
  onCopy(id: string): void;
  onRemove(id: string): void;
  /** Renders non-interactively: no dragging, selection, Transformer, remove
   *  ✕, toolbar pill or Delete key, and the page may scroll over it (used by
   *  Look detail). */
  readOnly?: boolean;
  /** Logical-space rect to fit into the container instead of the whole
   *  400x711 space. Read-only only (ignored when interactive). */
  viewRect?: LogicalRect;
}

interface StageLayout {
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Loads a same-origin image URL into an HTMLImageElement for Konva to draw,
 *  re-running only when the URL itself changes. */
function useHtmlImage(src?: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (!cancelled) setImage(img);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return image;
}

interface PlacedNodeProps {
  item: PlacedItem;
  isSelected: boolean;
  readOnly: boolean;
  layout: StageLayout;
  onSelect: () => void;
  onChangeTransform: (patch: TransformPatch) => void;
  /** A drag of this piece started / ended (hides the remove ✕ meanwhile). */
  onGestureChange: (active: boolean) => void;
  registerRef: (node: Konva.Image | null) => void;
}

/** One placed piece on the canvas. Konva's default rotation pivot is a
 *  node's (x, y) anchor (top-left); the stored contract is that (x, y) is the
 *  *unrotated top-left* corner with rotation pivoting around the box's
 *  *centre*. To match it, the Konva node's real x/y is the box's centre and
 *  offsetX/offsetY are half width/height, so Konva also pivots around the
 *  centre — while the value we store/emit (`item.x`, `item.y`) stays the
 *  unrotated top-left corner, converted back from the node's centre on every
 *  change. */
function PlacedNode({
  item,
  isSelected,
  readOnly,
  layout,
  onSelect,
  onChangeTransform,
  onGestureChange,
  registerRef,
}: PlacedNodeProps) {
  // New placements are sized to their image's real aspect by the builder
  // before they are added, so the canvas draws the image into the stored box
  // as-is. Until the image loads (or when there is none) the same node draws
  // the fallback fill instead.
  const image = useHtmlImage(item.cutoutURL ?? item.imageURL);

  /** Clamp a logical placement into the design space, move the node to the
   *  clamped centre (so it never lingers outside even if the resulting props
   *  equal the previous ones and React skips the update), and emit it. */
  const commitClamped = (node: Konva.Node, placement: TransformPatch) => {
    const clamped = clampItem(placement);
    node.position({ x: clamped.x + clamped.width / 2, y: clamped.y + clamped.height / 2 });
    onChangeTransform(clamped);
  };

  // Keep the item inside the design space while it is being dragged. Konva
  // passes/expects the node's absolute position (its centre, because of the
  // centre offset), i.e. logical centre * scale + stage offset.
  const dragBoundFunc = (pos: { x: number; y: number }) => {
    const { scale, offsetX, offsetY } = layout;
    if (scale <= 0) return pos;
    const centerX = (pos.x - offsetX) / scale;
    const centerY = (pos.y - offsetY) / scale;
    const clamped = clampItem({
      x: centerX - item.width / 2,
      y: centerY - item.height / 2,
      width: item.width,
      height: item.height,
      rotation: item.rotation,
    });
    return {
      x: (clamped.x + item.width / 2) * scale + offsetX,
      y: (clamped.y + item.height / 2) * scale + offsetY,
    };
  };

  const handleDragStart = () => {
    onSelect();
    onGestureChange(true);
  };

  const handleDragEnd = (event: Konva.KonvaEventObject<DragEvent>) => {
    const node = event.target;
    onGestureChange(false);
    commitClamped(node, {
      x: node.x() - item.width / 2,
      y: node.y() - item.height / 2,
      width: item.width,
      height: item.height,
      rotation: item.rotation,
    });
  };

  const handleTransformEnd = (event: Konva.KonvaEventObject<Event>) => {
    const node = event.target;
    const width = Math.max(MIN_SIZE, item.width * node.scaleX());
    const height = Math.max(MIN_SIZE, item.height * node.scaleY());
    node.scaleX(1);
    node.scaleY(1);
    // Bake the scale into the node's size so it stays consistent (centre
    // pivot intact) before React re-renders it with the new props.
    node.size({ width, height });
    node.offset({ x: width / 2, y: height / 2 });
    commitClamped(node, {
      x: node.x() - width / 2,
      y: node.y() - height / 2,
      width,
      height,
      rotation: node.rotation(),
    });
  };

  const shared = {
    x: item.x + item.width / 2,
    y: item.y + item.height / 2,
    offsetX: item.width / 2,
    offsetY: item.height / 2,
    width: item.width,
    height: item.height,
    rotation: item.rotation,
    cornerRadius: 12,
    draggable: !readOnly,
    dragDistance: DRAG_DISTANCE,
    stroke: !readOnly && isSelected ? "#99606E" : undefined,
    strokeWidth: !readOnly && isSelected ? 2 : 0,
    onClick: readOnly ? undefined : onSelect,
    onTap: readOnly ? undefined : onSelect,
    onDragStart: readOnly ? undefined : handleDragStart,
    dragBoundFunc: readOnly ? undefined : dragBoundFunc,
    onDragEnd: readOnly ? undefined : handleDragEnd,
    onTransformEnd: readOnly ? undefined : handleTransformEnd,
  };

  // Always the same Konva.Image node (never swapped for a placeholder Rect
  // when the image arrives), so the Transformer stays attached to a live node.
  // Konva.Image paints its fill when it has no image.
  return (
    <KonvaImage
      ref={registerRef}
      image={image ?? undefined}
      fill={image ? undefined : item.iconBg}
      {...shared}
    />
  );
}

/** Icon button of the selection pill (dark pill, light icons); finger-sized
 *  (44px) on coarse pointers. */
const PILL_BUTTON =
  "flex h-8 w-8 items-center justify-center rounded-full text-white/85 transition hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white pointer-coarse:h-11 pointer-coarse:w-11";

/** Fixed arrange canvas for the Outfit Builder: a controlled Konva surface
 *  over the placed items and selection owned by the page. The Stage fills
 *  its container; the 400x711 logical space is fitted into it with
 *  `fitToScreen` and, when interactive, drawn as a white framed board so the
 *  area pieces are kept inside is visible. Items are selected by tap, moved
 *  by one-finger / mouse drag, and resized/rotated with the Transformer handles of the
 *  selected item; every move is clamped into the logical space. There is
 *  deliberately no wheel, pinch-to-pan or drag-on-empty-space handling:
 *  dragging empty space does nothing (and `touch-action: none` stops it
 *  scrolling the page); tapping empty space deselects. The selected piece
 *  gets a red ✕ (HTML button overlaid on its top-right corner) to remove it,
 *  plus a dark pill at the bottom with send-to-back / bring-to-front / copy;
 *  on desktop Delete / Backspace also removes it. */
export function OutfitCanvas({
  items,
  selectedId,
  onSelect,
  onChangeTransform,
  onReorder,
  onCopy,
  onRemove,
  readOnly = false,
  viewRect,
}: OutfitCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<string, Konva.Image>());
  const pillRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  /** A piece is being dragged or resized/rotated: the remove ✕ is hidden
   *  meanwhile so it never lags behind the moving piece. */
  const [gestureActive, setGestureActive] = useState(false);
  /** The selection pill's rect in container pixels (null until measured). */
  const [pillRect, setPillRect] = useState<LogicalRect | null>(null);

  // The container is always mounted (even with no items) so it is measured
  // on first render, before the first item is placed.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = (width: number, height: number) => {
      if (width > 0 && height > 0) {
        setStageSize((prev) =>
          prev.width === width && prev.height === height ? prev : { width, height },
        );
      }
    };
    update(el.clientWidth, el.clientHeight);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      update(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fit =
    readOnly && viewRect ? fitRectToScreen(stageSize, viewRect) : fitToScreen(stageSize);
  const layout: StageLayout = { ...stageSize, ...fit };
  const isMeasured = stageSize.width > 0 && stageSize.height > 0 && fit.scale > 0;

  const selectedItem =
    selectedId !== null ? (items.find((item) => item.id === selectedId) ?? null) : null;
  const showSelectionUi = !readOnly && selectedItem !== null;

  // Measure the pill (bottom-centre of the container) whenever it appears or
  // the container resizes, so the ✕ can be kept clear of it.
  useLayoutEffect(() => {
    const pill = pillRef.current;
    const container = containerRef.current;
    if (!showSelectionUi || !pill || !container) return;
    const p = pill.getBoundingClientRect();
    const c = container.getBoundingClientRect();
    const next = { x: p.left - c.left, y: p.top - c.top, width: p.width, height: p.height };
    setPillRect((prev) =>
      prev &&
      prev.x === next.x &&
      prev.y === next.y &&
      prev.width === next.width &&
      prev.height === next.height
        ? prev
        : next,
    );
  }, [showSelectionUi, stageSize.width, stageSize.height]);

  // Desktop: Delete / Backspace removes the selected piece, except while
  // typing in a field (e.g. the picker's search box), with a modifier held,
  // or mid drag/transform.
  useEffect(() => {
    if (readOnly || selectedId === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!shouldDeleteOnKey(event, document.activeElement)) return;
      const busy =
        Boolean(trRef.current?.isTransforming()) ||
        [...nodeRefs.current.values()].some((node) => node.isDragging());
      if (busy) return;
      event.preventDefault();
      onRemove(selectedId);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [readOnly, selectedId, onRemove]);

  useEffect(() => {
    const transformer = trRef.current;
    if (!transformer) return;
    const node = selectedItem ? nodeRefs.current.get(selectedItem.id) : undefined;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedItem, items, readOnly]);

  /** A piece is being dragged or the Transformer is mid resize/rotate.
   *  (Checked on our own nodes rather than via the global `Konva` object so
   *  this module keeps a type-only konva import.) */
  const isGestureActive = () =>
    Boolean(trRef.current?.isTransforming()) ||
    [...nodeRefs.current.values()].some((node) => node.isDragging());

  const handleStagePointerDown = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    // Tap/click on empty space (the Stage itself, not a shape) deselects —
    // but not a second finger landing mid-gesture, nor anything during a drag.
    if (event.target !== event.target.getStage()) return;
    if ("touches" in event.evt && event.evt.touches.length > 1) return;
    if (isGestureActive()) return;
    onSelect(null);
  };

  // The remove ✕: on the top-right corner of the selected piece's rotated
  // bounding box (in screen pixels), kept inside the container and clear of
  // the pill. Derived from props + stage size on every render, so it follows
  // the piece after a transform, Undo/Redo and resizes; hidden mid-gesture.
  const crossPosition =
    showSelectionUi && selectedItem && isMeasured && !gestureActive
      ? crossButtonPosition(rotatedBounds([selectedItem]), fit, stageSize, {
          exclusions: pillRect ? [pillRect] : [],
        })
      : null;

  const ordered = [...items].sort((a, b) => a.zIndex - b.zIndex);
  const isEmpty = items.length === 0;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-cute-bg"
      style={{ ...DOTTED_BACKGROUND, touchAction: readOnly ? "auto" : "none" }}
      data-testid="outfit-canvas"
    >
      {isMeasured && (
        <Stage
          width={stageSize.width}
          height={stageSize.height}
          x={fit.offsetX}
          y={fit.offsetY}
          scaleX={fit.scale}
          scaleY={fit.scale}
          listening={!readOnly}
          onMouseDown={readOnly ? undefined : handleStagePointerDown}
          onTouchStart={readOnly ? undefined : handleStagePointerDown}
        >
          <Layer listening={!readOnly}>
            {/* Beneath every piece; not listening, so a tap on empty board
                still hits the Stage and deselects. */}
            {!readOnly && (
              <Rect
                name={BOARD_NODE_NAME}
                x={0}
                y={0}
                width={DESIGN_WIDTH}
                height={DESIGN_HEIGHT}
                fill={BOARD_FILL}
                stroke={BOARD_STROKE}
                strokeWidth={1.5}
                strokeScaleEnabled={false}
                cornerRadius={6}
                listening={false}
                perfectDrawEnabled={false}
              />
            )}
            {ordered.map((item) => (
              <PlacedNode
                key={item.id}
                item={item}
                isSelected={selectedId === item.id}
                readOnly={readOnly}
                layout={layout}
                onSelect={() => onSelect(item.id)}
                onChangeTransform={(patch) => onChangeTransform(item.id, patch)}
                onGestureChange={setGestureActive}
                registerRef={(node) => {
                  if (node) nodeRefs.current.set(item.id, node);
                  else nodeRefs.current.delete(item.id);
                }}
              />
            ))}
            {!readOnly && (
              <Transformer
                ref={trRef}
                rotateEnabled
                enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
                anchorSize={ANCHOR_SIZE}
                rotateAnchorOffset={ROTATE_ANCHOR_OFFSET}
                onTransformStart={() => setGestureActive(true)}
                onTransformEnd={() => setGestureActive(false)}
                boundBoxFunc={(oldBox, newBox) =>
                  newBox.width < MIN_SIZE || newBox.height < MIN_SIZE ? oldBox : newBox
                }
              />
            )}
          </Layer>
        </Stage>
      )}

      {isEmpty && (
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center"
        >
          <Shirt size={36} className="text-cute-text-muted" />
          <p className="font-body text-sm text-cute-text-muted">
            {readOnly
              ? "No pieces in this look."
              : "Add pieces from the picker to start building your look."}
          </p>
        </div>
      )}

      {crossPosition && selectedItem && (
        <button
          type="button"
          onClick={() => onRemove(selectedItem.id)}
          aria-label={`Remove ${selectedItem.name}`}
          data-testid="remove-piece"
          className="group absolute z-10 flex items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-cute-text"
          style={{ ...crossPosition, width: CROSS_HIT_SIZE, height: CROSS_HIT_SIZE }}
        >
          {/* 22px visual inside the 44px hit area. */}
          <span
            aria-hidden="true"
            className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-cute-destructive text-cute-destructive-foreground shadow-sm ring-2 ring-white transition group-hover:brightness-110 group-active:scale-90"
          >
            <X size={13} strokeWidth={3} />
          </span>
        </button>
      )}

      {showSelectionUi && selectedItem && (
        <div
          ref={pillRef}
          className="absolute bottom-3 left-1/2 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1 rounded-full bg-cute-text p-1 shadow-md"
          role="toolbar"
          aria-label={`${selectedItem.name} actions`}
        >
          <button
            type="button"
            onClick={() => onReorder(selectedItem.id, "back")}
            aria-label="Send to back"
            className={PILL_BUTTON}
          >
            <ArrowDownToLine size={15} />
          </button>
          <button
            type="button"
            onClick={() => onReorder(selectedItem.id, "front")}
            aria-label="Bring to front"
            className={PILL_BUTTON}
          >
            <ArrowUpToLine size={15} />
          </button>
          <button
            type="button"
            onClick={() => onCopy(selectedItem.id)}
            aria-label="Copy"
            className={PILL_BUTTON}
          >
            <Copy size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
