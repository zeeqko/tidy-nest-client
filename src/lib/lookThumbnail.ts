import { rotatedBounds, type Placement } from "./canvasSpace";

export interface ThumbnailBox {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

/** Maps each placement's saved (x, y, width, height) onto percentages of a
 *  square thumbnail box, uniformly scaled (never stretched) and centred on
 *  whichever axis has slack. The crop is the union of the *rotated* bounding
 *  boxes, so a rotated piece near the edge is not clipped; each item's own
 *  box stays its unrotated rect (the consumer rotates it about its own centre
 *  with CSS, matching the canvas pivot). Returned in input order, z-order
 *  sorting is the caller's concern. */
export function thumbnailLayout<T extends Placement>(items: T[]): (T & ThumbnailBox)[] {
  if (items.length === 0) return [];
  const bounds = rotatedBounds(items);
  const spanX = Math.max(bounds.width, 1);
  const spanY = Math.max(bounds.height, 1);
  const span = Math.max(spanX, spanY);
  const originX = bounds.x - (span - spanX) / 2;
  const originY = bounds.y - (span - spanY) / 2;
  return items.map((item) => ({
    ...item,
    leftPct: ((item.x - originX) / span) * 100,
    topPct: ((item.y - originY) / span) * 100,
    widthPct: (item.width / span) * 100,
    heightPct: (item.height / span) * 100,
  }));
}
