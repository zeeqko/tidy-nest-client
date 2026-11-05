import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type Konva from "konva";
import { Image as KonvaImage, Layer, Rect, Stage, Transformer } from "react-konva";
import { ArrowDownToLine, ArrowUpToLine, Copy, Shirt, Trash2 } from "lucide-react";
import type { PlacedItem } from "./OutfitBuilderPage";
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  clampItem,
  fitRectToScreen,
  fitToScreen,
  type Rect as LogicalRect,
} from "../lib/canvasSpace";

/** Every placed item's (x, y, width, height) lives in the fixed
 *  DESIGN_WIDTH x DESIGN_HEIGHT (400x711, 9:16) logical space from
 *  `canvasSpace`. The Stage itself fills its container (full-screen in the
 *  builder); `fitToScreen` maps the logical space into it with a uniform
 *  scale plus a centring offset (letterboxed). Resizing the window or
 *  rotating the device only changes that scale/offset, never item positions. */
const MIN_SIZE = 24;

/** Dotted backdrop drawn behind the (transparent) Stage, across the whole
 *  stage area including any letterbox margins. */
const DOTTED_BACKGROUND = {
  backgroundImage: "radial-gradient(var(--color-cute-border) 1.5px, transparent 1.5px)",
  backgroundSize: "18px 18px",
} as const;

export type TransformPatch = Pick<PlacedItem, "x" | "y" | "width" | "height" | "rotation">;

export interface OutfitCanvasProps {
  items: PlacedItem[];
  selectedId: string | null;
  onSelect(id: string | null): void;
  onChangeTransform(id: string, patch: TransformPatch): void;
  onReorder(id: string, direction: "front" | "back"): void;
  onCopy(id: string): void;
  onRemove(id: string): void;
  /** Renders non-interactively: no dragging, selection, Transformer or
   *  toolbar, and the page may scroll over it (used by Look detail). */
  readOnly?: boolean;
  /** Logical-space rect to fit into the container instead of the whole
   *  400x711 space. Read-only only (ignored when interactive). */
  viewRect?: LogicalRect;
  /** Pixels at the bottom of the stage covered by the page's picker sheet. */
  visibleBottomInset?: number;
  /** Receives the logical-space rect visible above `visibleBottomInset`
   *  (clamped into the 400x711 space) — `placeItem`'s `visible` argument.
   *  Recomputed whenever the stage size or the inset changes. */
  onVisibleRectChange?(rect: LogicalRect): void;
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

/** Logical rect visible above the bottom inset, clamped into the design space. */
function visibleLogicalRect(layout: StageLayout, bottomInset: number): LogicalRect {
  const { width, height, scale, offsetX, offsetY } = layout;
  const toLogicalX = (px: number) => Math.min(DESIGN_WIDTH, Math.max(0, (px - offsetX) / scale));
  const toLogicalY = (px: number) => Math.min(DESIGN_HEIGHT, Math.max(0, (px - offsetY) / scale));
  const left = toLogicalX(0);
  const right = toLogicalX(width);
  const top = toLogicalY(0);
  const bottom = Math.max(top, toLogicalY(height - Math.max(0, bottomInset)));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

interface PlacedNodeProps {
  item: PlacedItem;
  isSelected: boolean;
  readOnly: boolean;
  layout: StageLayout;
  onSelect: () => void;
  onChangeTransform: (patch: TransformPatch) => void;
  registerRef: (node: Konva.Image | Konva.Rect | null) => void;
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
  registerRef,
}: PlacedNodeProps) {
  // New placements are sized to their image's real aspect by the builder
  // before they are added, so the canvas draws the image into the stored box
  // as-is.
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

  const handleDragEnd = (event: Konva.KonvaEventObject<DragEvent>) => {
    const node = event.target;
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
    stroke: !readOnly && isSelected ? "#99606E" : undefined,
    strokeWidth: !readOnly && isSelected ? 2 : 0,
    onClick: readOnly ? undefined : onSelect,
    onTap: readOnly ? undefined : onSelect,
    onDragStart: readOnly ? undefined : onSelect,
    dragBoundFunc: readOnly ? undefined : dragBoundFunc,
    onDragEnd: readOnly ? undefined : handleDragEnd,
    onTransformEnd: readOnly ? undefined : handleTransformEnd,
  };

  if (image) {
    return <KonvaImage ref={registerRef} image={image} {...shared} />;
  }
  return <Rect ref={registerRef} fill={item.iconBg} {...shared} />;
}

const TOOLBAR_BUTTON =
  "flex h-8 w-8 items-center justify-center rounded-full text-cute-text-muted transition hover:bg-cute-surface-alt hover:text-cute-text";

/** Fixed full-screen arrange canvas for the Outfit Builder: a controlled
 *  Konva surface over the placed items and selection owned by the page.
 *  The Stage fills its container; the 400x711 logical space is fitted into
 *  it with `fitToScreen`. Items are selected by tap, moved by one-finger /
 *  mouse drag, and resized/rotated with the Transformer handles of the
 *  selected item; every move is clamped into the logical space. There is
 *  deliberately no wheel, pinch-to-pan or drag-on-empty-space handling:
 *  dragging empty space does nothing (and `touch-action: none` stops it
 *  scrolling the page); tapping empty space deselects. */
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
  visibleBottomInset = 0,
  onVisibleRectChange,
}: OutfitCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<string, Konva.Image | Konva.Rect>());
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  // The container is always mounted (even with no items) so it can be
  // measured on first render and the visible rect reported before the first
  // item is placed.
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

  const onVisibleRectChangeRef = useRef(onVisibleRectChange);
  onVisibleRectChangeRef.current = onVisibleRectChange;
  useEffect(() => {
    if (!isMeasured) return;
    onVisibleRectChangeRef.current?.(
      visibleLogicalRect(
        { ...stageSize, ...fitToScreen(stageSize) },
        visibleBottomInset,
      ),
    );
  }, [isMeasured, stageSize, visibleBottomInset]);

  const selectedItem =
    selectedId !== null ? (items.find((item) => item.id === selectedId) ?? null) : null;

  useEffect(() => {
    const transformer = trRef.current;
    if (!transformer) return;
    const node = selectedItem ? nodeRefs.current.get(selectedItem.id) : undefined;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedItem, items, readOnly]);

  const handleStagePointerDown = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    // Tap/click on empty space (the Stage itself, not a shape) deselects.
    if (event.target === event.target.getStage()) onSelect(null);
  };

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
            {ordered.map((item) => (
              <PlacedNode
                key={item.id}
                item={item}
                isSelected={selectedId === item.id}
                readOnly={readOnly}
                layout={layout}
                onSelect={() => onSelect(item.id)}
                onChangeTransform={(patch) => onChangeTransform(item.id, patch)}
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
                // Default rotate-handle offset (50) can land off-stage for
                // pieces near the top edge; a smaller offset keeps it
                // reachable while clear of the corner anchors.
                rotateAnchorOffset={16}
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
          className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center justify-center gap-2 p-6 text-center"
          style={{ bottom: Math.max(0, visibleBottomInset) }}
        >
          <Shirt size={36} className="text-cute-text-muted" />
          <p className="font-body text-sm text-cute-text-muted">
            {readOnly
              ? "No pieces in this look."
              : "Add pieces from the picker to start building your look."}
          </p>
        </div>
      )}

      {!readOnly && selectedItem && (
        <div
          className="absolute left-1/2 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-cute-border bg-cute-surface py-1.5 pr-1.5 pl-3 shadow-sm"
          style={{ bottom: Math.max(0, visibleBottomInset) + 12 }}
          role="toolbar"
          aria-label={`${selectedItem.name} actions`}
        >
          <span className="truncate font-body text-xs font-medium text-cute-text">
            {selectedItem.name}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onReorder(selectedItem.id, "back")}
              aria-label="Send backward"
              className={TOOLBAR_BUTTON}
            >
              <ArrowDownToLine size={15} />
            </button>
            <button
              type="button"
              onClick={() => onReorder(selectedItem.id, "front")}
              aria-label="Bring to front"
              className={TOOLBAR_BUTTON}
            >
              <ArrowUpToLine size={15} />
            </button>
            <button
              type="button"
              onClick={() => onCopy(selectedItem.id)}
              aria-label={`Copy ${selectedItem.name}`}
              className={TOOLBAR_BUTTON}
            >
              <Copy size={15} />
            </button>
            <button
              type="button"
              onClick={() => onRemove(selectedItem.id)}
              aria-label={`Remove ${selectedItem.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-full text-cute-text-muted transition hover:bg-cute-danger/10 hover:text-cute-danger"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
