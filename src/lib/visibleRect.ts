import { DESIGN_HEIGHT, DESIGN_WIDTH, type Rect } from "./canvasSpace";

/** The whole 400x711 logical space. */
export const FULL_SPACE: Rect = { x: 0, y: 0, width: DESIGN_WIDTH, height: DESIGN_HEIGHT };

/** Below this visible height (logical units) a new piece would be squeezed
 *  to almost nothing, so placement uses the whole space instead. */
export const MIN_VISIBLE_HEIGHT = 120;

/**
 * Rect to place a new piece into: the canvas's last reported visible rect,
 * or the whole space when none was reported yet or the picker sheet covers
 * (nearly) all of the canvas.
 */
export function placementArea(visible: Rect | null): Rect {
  if (!visible || visible.width <= 0 || visible.height < MIN_VISIBLE_HEIGHT) return FULL_SPACE;
  return visible;
}
