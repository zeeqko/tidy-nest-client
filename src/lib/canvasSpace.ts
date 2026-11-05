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

/** Uniformly scale the design space to fit the viewport, centred. */
export function fitToScreen(viewport: { width: number; height: number }): {
  scale: number;
  offsetX: number;
  offsetY: number;
} {
  const scale = Math.min(viewport.width / DESIGN_WIDTH, viewport.height / DESIGN_HEIGHT);
  return {
    scale,
    offsetX: (viewport.width - DESIGN_WIDTH * scale) / 2,
    offsetY: (viewport.height - DESIGN_HEIGHT * scale) / 2,
  };
}

function clampAxis(center: number, half: number, space: number): number {
  if (half * 2 >= space) return space / 2;
  return Math.min(Math.max(center, half), space - half);
}

/** Translate (never resize/rotate) so the rotated bounding box lies inside the
 *  design space; centre on an axis where the box is larger than the space. */
export function clampItem<T extends Placement>(item: T): T {
  const rad = (item.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const halfW = (item.width * cos + item.height * sin) / 2;
  const halfH = (item.width * sin + item.height * cos) / 2;
  const cx = clampAxis(item.x + item.width / 2, halfW, DESIGN_WIDTH);
  const cy = clampAxis(item.y + item.height / 2, halfH, DESIGN_HEIGHT);
  const x = cx - item.width / 2;
  const y = cy - item.height / 2;
  if (x === item.x && y === item.y) return item;
  return { ...item, x, y };
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
