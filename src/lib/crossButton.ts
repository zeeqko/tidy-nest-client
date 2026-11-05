import type { Rect } from "./canvasSpace";

/** Side (px) of the square hit area of the canvas's remove (✕) button: the
 *  minimum comfortable touch target. The visual circle is smaller and centred
 *  inside it. */
export const CROSS_HIT_SIZE = 44;

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
 * on it, then clamped so the whole hit area stays inside the `container`
 * (a piece pushed into a corner still has a reachable ✕), and moved above
 * any `exclusions` it would overlap (see `CrossButtonOptions.exclusions`).
 */
export function crossButtonPosition(
  bounds: Rect,
  fit: StageFit,
  container: { width: number; height: number },
  options: CrossButtonOptions = {},
): { left: number; top: number } {
  const size = options.hitSize ?? CROSS_HIT_SIZE;
  const cornerX = (bounds.x + bounds.width) * fit.scale + fit.offsetX;
  const cornerY = bounds.y * fit.scale + fit.offsetY;
  const left = clampStart(cornerX - size / 2, size, container.width);
  let top = clampStart(cornerY - size / 2, size, container.height);

  for (const exclusion of options.exclusions ?? []) {
    const hit = { x: left, y: top, width: size, height: size };
    if (overlaps(hit, exclusion)) {
      top = clampStart(exclusion.y - CROSS_EXCLUSION_GAP - size, size, container.height);
    }
  }
  return { left, top };
}
