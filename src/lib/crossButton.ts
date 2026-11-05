import type { Rect } from "./canvasSpace";

/** Side (px) of the square hit area of the canvas's remove (✕) button: the
 *  minimum comfortable touch target. The visual circle is smaller and centred
 *  inside it. */
export const CROSS_HIT_SIZE = 44;

/** Diameter (px) of the visible red circle inside the hit area. */
export const CROSS_VISUAL_SIZE = 22;

/** How far (px) the hit area's centre is pushed OUT of the piece from its
 *  top-right corner, on each axis (right and up): the visible circle's
 *  radius. The circle then sits just outside the corner (tangent to the
 *  lines of the piece's top and right edges) and only ~11px of the 44px hit
 *  area overlaps the piece on each axis, so a tap or drag-start in the
 *  piece's corner interior, or on a narrow piece's rotate handle, no longer
 *  hits the ✕. */
export const CROSS_OUTSET = CROSS_VISUAL_SIZE / 2;

/** Gap (px) kept between the ✕ hit area and an exclusion rect (the toolbar pill). */
export const CROSS_EXCLUSION_GAP = 4;

export interface StageFit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface CrossButtonOptions {
  /** Side of the square hit area (default `CROSS_HIT_SIZE`). */
  hitSize?: number;
  /** Outward shift of the hit area's centre from the corner, right and up
   *  (default `CROSS_OUTSET`). */
  outset?: number;
  /** Container-pixel rects the hit area must not overlap (e.g. the toolbar
   *  pill docked at the bottom of the canvas). When the hit area would
   *  overlap one, it is moved straight UP until it clears it (plus
   *  `CROSS_EXCLUSION_GAP`) — the pill keeps its place at the bottom — and
   *  then re-clamped into the container (the container edge wins if both
   *  cannot be satisfied, i.e. a container too short for both). */
  exclusions?: Rect[];
}

/** Clamp `start` so a `size`-long segment stays inside 0..`space`; centre it
 *  when the space is smaller than the segment. */
function clampStart(start: number, size: number, space: number): number {
  if (size >= space) return (space - size) / 2;
  return Math.min(Math.max(start, 0), space - size);
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Container-pixel `{ left, top }` of the remove (✕) button's square hit area
 * for a selected piece.
 *
 * `bounds` is the piece's rotated bounding box in logical (400x711) space —
 * from `rotatedBounds([item])`. Its top-right corner is mapped to the screen
 * with the stage fit (`logical * scale + offset`) and the hit area is centred
 * `outset` px right of and above it (`corner.x + 11, corner.y - 11` by
 * default, so it mostly sits outside the piece), then clamped so the whole
 * hit area stays inside the `container` (a piece pushed into a corner still
 * has a reachable ✕; the clamp uses the shifted position), and moved above
 * any `exclusions` it would overlap (see `CrossButtonOptions.exclusions`).
 */
export function crossButtonPosition(
  bounds: Rect,
  fit: StageFit,
  container: { width: number; height: number },
  options: CrossButtonOptions = {},
): { left: number; top: number } {
  const size = options.hitSize ?? CROSS_HIT_SIZE;
  const outset = options.outset ?? CROSS_OUTSET;
  const centreX = (bounds.x + bounds.width) * fit.scale + fit.offsetX + outset;
  const centreY = bounds.y * fit.scale + fit.offsetY - outset;
  const left = clampStart(centreX - size / 2, size, container.width);
  let top = clampStart(centreY - size / 2, size, container.height);

  for (const exclusion of options.exclusions ?? []) {
    const hit = { x: left, y: top, width: size, height: size };
    if (overlaps(hit, exclusion)) {
      top = clampStart(exclusion.y - CROSS_EXCLUSION_GAP - size, size, container.height);
    }
  }
  return { left, top };
}
