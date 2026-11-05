/** Logical canvas space (9:16). Placements: (x, y) is the unrotated top-left
 *  of the item's box; rotation is in degrees about the box centre. */
export const DESIGN_WIDTH = 400;
export const DESIGN_HEIGHT = 711;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Placement extends Rect {
  rotation: number;
}

/** Uniform scale plus offset mapping logical space onto the stage: a logical
 *  point p is drawn at p * scale + offset. */
export interface StageFit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Uniformly scale the design space to fit the viewport, centred. */
export function fitToScreen(viewport: { width: number; height: number }): StageFit {
  const scale = Math.max(0, Math.min(viewport.width / DESIGN_WIDTH, viewport.height / DESIGN_HEIGHT));
  return {
    scale,
    offsetX: (viewport.width - DESIGN_WIDTH * scale) / 2,
    offsetY: (viewport.height - DESIGN_HEIGHT * scale) / 2,
  };
}

/** Like `fitToScreen`, but fits an arbitrary logical `rect` into the viewport
 *  (uniform scale, centred). A zero/negative-size rect falls back to the whole
 *  design space. The offsets position the logical origin, so a logical point
 *  maps to `point * scale + offset`. */
export function fitRectToScreen(
  viewport: { width: number; height: number },
  rect: Rect,
): StageFit {
  if (!(rect.width > 0) || !(rect.height > 0)) return fitToScreen(viewport);
  const scale = Math.max(0, Math.min(viewport.width / rect.width, viewport.height / rect.height));
  return {
    scale,
    offsetX: (viewport.width - rect.width * scale) / 2 - rect.x * scale,
    offsetY: (viewport.height - rect.height * scale) / 2 - rect.y * scale,
  };
}

function clampAxis(center: number, half: number, min: number, size: number): number {
  if (half * 2 >= size) return min + size / 2;
  return Math.min(Math.max(center, min + half), min + size - half);
}

/** The base 400x711 logical rect (what `fitToScreen` fits and where new
 *  pieces are placed). Stored coordinates may lie outside it. */
export const DESIGN_RECT: Rect = { x: 0, y: 0, width: DESIGN_WIDTH, height: DESIGN_HEIGHT };

/** Translate (never resize/rotate) so the rotated bounding box lies inside
 *  `bounds` (default: the base design rect); centre on an axis where the box
 *  is larger than `bounds`. */
export function clampItem<T extends Placement>(item: T, bounds: Rect = DESIGN_RECT): T {
  const rad = (item.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const halfW = (item.width * cos + item.height * sin) / 2;
  const halfH = (item.width * sin + item.height * cos) / 2;
  const centerX = item.x + item.width / 2;
  const centerY = item.y + item.height / 2;
  const cx = clampAxis(centerX, halfW, bounds.x, bounds.width);
  const cy = clampAxis(centerY, halfH, bounds.y, bounds.height);
  // Compare centres (not the round-tripped x/y) so an untouched axis keeps its
  // exact original value instead of picking up floating-point drift.
  const x = cx === centerX ? item.x : cx - item.width / 2;
  const y = cy === centerY ? item.y : cy - item.height / 2;
  if (x === item.x && y === item.y) return item;
  return { ...item, x, y };
}

/** The logical rect a viewport shows under `fit` (a logical point p is drawn
 *  at p * scale + offset). Falls back to the base design rect for a
 *  degenerate fit (zero scale) or viewport. */
export function visibleLogicalRect(viewport: { width: number; height: number }, fit: StageFit): Rect {
  if (!(fit.scale > 0) || !(viewport.width > 0) || !(viewport.height > 0)) return { ...DESIGN_RECT };
  return {
    x: -fit.offsetX / fit.scale,
    y: -fit.offsetY / fit.scale,
    width: viewport.width / fit.scale,
    height: viewport.height / fit.scale,
  };
}

/** Logical units of breathing room kept around the pieces when the view has
 *  to zoom out to show them (see `fitToScreenFor`). */
export const VIEW_PADDING = 12;

/** Slack (logical units) for the "already fully visible" test, so sub-pixel
 *  differences in the measured panel size don't trigger a zoom-out. */
const VIEW_EPSILON = 1e-6;

function containsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x - VIEW_EPSILON &&
    inner.y >= outer.y - VIEW_EPSILON &&
    inner.x + inner.width <= outer.x + outer.width + VIEW_EPSILON &&
    inner.y + inner.height <= outer.y + outer.height + VIEW_EPSILON
  );
}

function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/** The interactive builder's view: the contain-fit of the base rect
 *  (`fitToScreen`), unless `content` (the pieces' rotated bounds, unpadded)
 *  is not fully visible under it, in which case the union of the base rect
 *  and `content` grown by `padding` is contain-fitted and centred instead
 *  (zoomed out just enough). `null` / empty content, or a degenerate
 *  viewport, gives `fitToScreen` unchanged. */
export function fitToScreenFor(
  viewport: { width: number; height: number },
  content: Rect | null,
  padding = VIEW_PADDING,
): StageFit {
  const base = fitToScreen(viewport);
  if (!content || !(base.scale > 0)) return base;
  if (containsRect(visibleLogicalRect(viewport, base), content)) return base;
  const padded = {
    x: content.x - padding,
    y: content.y - padding,
    width: content.width + 2 * padding,
    height: content.height + 2 * padding,
  };
  return fitRectToScreen(viewport, unionRect(DESIGN_RECT, padded));
}

/** Union of the rects grown by `padding` on every side; zero rect if empty. */
export function lookBounds(items: Rect[], padding = 0): Rect {
  if (items.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of items) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + 2 * padding,
    height: maxY - minY + 2 * padding,
  };
}

/** Like `lookBounds` but accounts for rotation (degrees, about each item's
 *  centre): union of the rotated bounding boxes grown by `padding`; zero rect
 *  if empty. */
export function rotatedBounds(items: Placement[], padding = 0): Rect {
  if (items.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of items) {
    const rad = (item.rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const halfW = (item.width * cos + item.height * sin) / 2;
    const halfH = (item.width * sin + item.height * cos) / 2;
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    minX = Math.min(minX, cx - halfW);
    minY = Math.min(minY, cy - halfH);
    maxX = Math.max(maxX, cx + halfW);
    maxY = Math.max(maxY, cy + halfH);
  }
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + 2 * padding,
    height: maxY - minY + 2 * padding,
  };
}
