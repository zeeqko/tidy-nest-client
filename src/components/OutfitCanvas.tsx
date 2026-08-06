import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type Konva from "konva";
import { Image as KonvaImage, Layer, Rect, Stage, Transformer } from "react-konva";
import { ArrowDownToLine, ArrowUpToLine, Shirt, Trash2 } from "lucide-react";
import type { PlacedItem } from "./OutfitBuilderPage";

/** Fixed logical coordinate space every placed item's (x, y, width, height)
 *  lives in, regardless of how large the Stage is actually rendered on
 *  screen. The Stage's on-screen pixel size tracks its container (measured
 *  via ResizeObserver, so it fits a ~440px desktop column or a narrower
 *  mobile section), but a uniform Konva stage scale maps that pixel size
 *  back onto this fixed DESIGN_WIDTH x DESIGN_HEIGHT space. That keeps saved
 *  transforms resolution-independent: the same look reconstructs identically
 *  (via LookCard's percentage-based layout) no matter what screen size it
 *  was built or is later viewed on. Matches the 4:5 aspect ratio of the
 *  panel this canvas renders inside. */
const DESIGN_WIDTH = 400;
const DESIGN_HEIGHT = 500;
const MIN_SIZE = 24;

type TransformPatch = Pick<PlacedItem, "x" | "y" | "width" | "height" | "rotation">;

interface OutfitCanvasProps {
  items: PlacedItem[];
  onChangeTransform?: (id: string, patch: TransformPatch) => void;
  onReorder?: (id: string, direction: "front" | "back") => void;
  onRemove?: (id: string) => void;
  /** Renders the canvas non-interactively: no dragging, no selection, no
   *  Transformer handles, and no selection toolbar/helper text. Used by
   *  read-only surfaces (e.g. Look detail) that only need to display a
   *  saved arrangement. Defaults to false so the Outfit Builder's existing
   *  fully-interactive usage is unaffected. */
  readOnly?: boolean;
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
  onSelect: () => void;
  onChangeTransform: (patch: TransformPatch) => void;
  registerRef: (node: Konva.Image | Konva.Rect | null) => void;
}

/** One placed piece on the canvas. Konva's default rotation pivot is a
 *  node's (x, y) anchor (top-left); `LookCard.tsx` assumes (x, y) is the
 *  *unrotated top-left* corner with rotation pivoting around the box's
 *  *center* (CSS default transform-origin). To match that contract, the
 *  Konva node's real x/y is set to the box's center and offsetX/offsetY to
 *  half width/height, so Konva also pivots around center — while the value
 *  we store/emit (`item.x`, `item.y`) stays the unrotated top-left corner,
 *  converted back out of the node's center coordinates on every change. */
function PlacedNode({ item, isSelected, readOnly, onSelect, onChangeTransform, registerRef }: PlacedNodeProps) {
  const image = useHtmlImage(item.cutoutURL ?? item.imageURL);

  const handleDragEnd = (event: Konva.KonvaEventObject<DragEvent>) => {
    const node = event.target;
    onChangeTransform({
      x: node.x() - item.width / 2,
      y: node.y() - item.height / 2,
      width: item.width,
      height: item.height,
      rotation: item.rotation,
    });
  };

  const handleTransformEnd = (event: Konva.KonvaEventObject<Event>) => {
    const node = event.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const width = Math.max(MIN_SIZE, item.width * scaleX);
    const height = Math.max(MIN_SIZE, item.height * scaleY);
    node.scaleX(1);
    node.scaleY(1);
    onChangeTransform({
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
    onDragEnd: readOnly ? undefined : handleDragEnd,
    onTransformEnd: readOnly ? undefined : handleTransformEnd,
  };

  if (image) {
    return <KonvaImage ref={registerRef} image={image} {...shared} />;
  }
  return <Rect ref={registerRef} fill={item.iconBg} {...shared} />;
}

/** Freeform arrange-and-drag canvas for the Outfit Builder: a controlled
 *  Konva surface over the placed-items array owned by `OutfitBuilderPage`.
 *  Renders items in `zIndex` order, supports select/deselect, drag, corner
 *  resize + rotate (via Konva's `Transformer`), a bring-to-front/send-back
 *  layering control, and removing the selected piece. Touch drag/resize
 *  works via Konva's built-in pointer handling — no extra wiring needed. */
export function OutfitCanvas({
  items,
  onChangeTransform = () => {},
  onReorder = () => {},
  onRemove = () => {},
  readOnly = false,
}: OutfitCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<string, Konva.Image | Konva.Rect>());
  const [stageSize, setStageSize] = useState({ width: DESIGN_WIDTH, height: DESIGN_HEIGHT });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = (width: number, height: number) => {
      if (width > 0 && height > 0) setStageSize({ width, height });
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

  useEffect(() => {
    if (selectedId !== null && !items.some((item) => item.id === selectedId)) {
      setSelectedId(null);
    }
  }, [items, selectedId]);

  useEffect(() => {
    const transformer = trRef.current;
    if (!transformer) return;
    const node = selectedId !== null ? nodeRefs.current.get(selectedId) : undefined;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, items]);

  const scale = stageSize.width / DESIGN_WIDTH;

  const handleStagePointerDown = (
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    if (event.target === event.target.getStage()) {
      setSelectedId(null);
    }
  };

  const ordered = [...items].sort((a, b) => a.zIndex - b.zIndex);

  const selectedItem = selectedId !== null ? items.find((item) => item.id === selectedId) ?? null : null;
  const isEmpty = items.length === 0;

  return (
    <div className="flex w-full flex-col gap-2">
      {/* Always mounted (even when empty) so `containerRef` attaches on
       *  first render and the ResizeObserver below can measure it — if this
       *  div only rendered once an item existed, the effect that wires up
       *  the observer (which only runs once, on mount) would find a null
       *  ref every time, and the Stage would stay locked at its default
       *  DESIGN_WIDTH/HEIGHT size forever regardless of container size. */}
      <div
        ref={containerRef}
        className="relative aspect-[4/5] w-full overflow-hidden rounded-cute-l border border-cute-border bg-cute-surface"
        style={{ touchAction: "none" }}
      >
        {isEmpty ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Shirt size={36} className="text-cute-text-muted" />
            <p className="font-body text-sm text-cute-text-muted">
              {readOnly
                ? "No pieces in this look."
                : "Add pieces from the picker to start building your look."}
            </p>
          </div>
        ) : (
        <Stage
          width={stageSize.width}
          height={stageSize.height}
          scaleX={scale}
          scaleY={scale}
          onMouseDown={handleStagePointerDown}
          onTouchStart={handleStagePointerDown}
        >
          <Layer>
            {ordered.map((item) => (
              <PlacedNode
                key={item.id}
                item={item}
                isSelected={selectedId === item.id}
                readOnly={readOnly}
                onSelect={() => setSelectedId(item.id)}
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
                // Default rotate-handle offset (50) can land above the visible
                // stage for pieces placed near the top edge (e.g. a freshly
                // added item's default spawn position), making the handle
                // unreachable; a smaller offset keeps it reachable while still
                // clear of the corner-resize anchors.
                rotateAnchorOffset={16}
                boundBoxFunc={(oldBox, newBox) =>
                  newBox.width < MIN_SIZE || newBox.height < MIN_SIZE ? oldBox : newBox
                }
              />
            )}
          </Layer>
        </Stage>
        )}
      </div>

      {!readOnly && !isEmpty && (selectedItem && selectedId !== null ? (
        <div className="flex w-full items-center justify-between gap-2 rounded-full border border-cute-border bg-cute-surface py-1.5 pr-1.5 pl-3">
          <span className="truncate font-body text-xs font-medium text-cute-text">
            {selectedItem.name}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onReorder(selectedId, "back")}
              aria-label="Send backward"
              className="flex h-8 w-8 items-center justify-center rounded-full text-cute-text-muted transition hover:bg-cute-surface-alt hover:text-cute-text"
            >
              <ArrowDownToLine size={15} />
            </button>
            <button
              type="button"
              onClick={() => onReorder(selectedId, "front")}
              aria-label="Bring to front"
              className="flex h-8 w-8 items-center justify-center rounded-full text-cute-text-muted transition hover:bg-cute-surface-alt hover:text-cute-text"
            >
              <ArrowUpToLine size={15} />
            </button>
            <button
              type="button"
              onClick={() => {
                onRemove(selectedId);
                setSelectedId(null);
              }}
              aria-label={`Remove ${selectedItem.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-full text-cute-text-muted transition hover:bg-cute-danger/10 hover:text-cute-danger"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      ) : (
        <p className="font-body text-xs text-cute-text-muted">
          Tap a piece to select it, then drag, resize, or rotate with the handles.
        </p>
      ))}
    </div>
  );
}
