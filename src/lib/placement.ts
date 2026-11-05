import { DESIGN_HEIGHT, DESIGN_WIDTH, type Placement, type Rect } from "./canvasSpace";

export type StylebookGroup = "clothes" | "shoes" | "accessories" | "bags";

type Zone = "outerwear" | "tops" | "bottoms" | "shoes" | "accessories" | "bags";

const ZONE_Y: Record<Zone, number> = {
  outerwear: 0.22,
  tops: 0.25,
  bottoms: 0.58,
  shoes: 0.88,
  accessories: 0.45,
  bags: 0.6,
};

const ZONE_SIZE: Record<Zone, number> = {
  outerwear: 0.5,
  tops: 0.5,
  bottoms: 0.5,
  shoes: 0.3,
  accessories: 0.2,
  bags: 0.28,
};

const ZONE_RANK: Record<Zone, number> = {
  bottoms: 0,
  shoes: 0,
  tops: 1,
  outerwear: 2,
  accessories: 3,
  bags: 3,
};

const SHIFT_FRACTION = 0.12;
const MAX_ATTEMPTS = 12;
const VERTICAL_OFFSETS = [0, 0.12, -0.12, 0.24, -0.24];
const ACCEPTABLE_OVERLAP = 0.25;

function zoneOf(group: StylebookGroup, subcategory: string): Zone {
  if (group !== "clothes") return group;
  const name = subcategory.toLowerCase();
  if (/outer|jacket|coat/.test(name)) return "outerwear";
  if (/bottom|pant|skirt|jean/.test(name)) return "bottoms";
  return "tops";
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

function clampInto(x: number, y: number, w: number, h: number, bounds: Rect) {
  return {
    x: Math.min(Math.max(x, bounds.x), bounds.x + bounds.width - w),
    y: Math.min(Math.max(y, bounds.y), bounds.y + bounds.height - h),
  };
}

export function placeItem(
  input: { group: StylebookGroup; subcategory: string; aspect: number },
  existing: Rect[],
  visible: Rect,
): Placement {
  const zone = zoneOf(input.group, input.subcategory);
  const bounds = intersect(visible, { x: 0, y: 0, width: DESIGN_WIDTH, height: DESIGN_HEIGHT });
  const aspect = input.aspect > 0 && Number.isFinite(input.aspect) ? input.aspect : 1;

  const longest = ZONE_SIZE[zone] * visible.width;
  let width = aspect >= 1 ? longest : longest * aspect;
  let height = aspect >= 1 ? longest / aspect : longest;
  const fit = Math.min(1, bounds.width / width, bounds.height / height);
  width *= fit;
  height *= fit;

  const centerX =
    zone === "accessories"
      ? visible.x + visible.width / 6
      : zone === "bags"
        ? visible.x + (visible.width * 5) / 6
        : visible.x + visible.width / 2;
  const centerY = visible.y + ZONE_Y[zone] * visible.height;
  const area = width * height;

  let best: Rect | null = null;
  let bestOverlap = Infinity;
  search: for (let k = 0; k < MAX_ATTEMPTS; k++) {
    const shift = k === 0 ? 0 : Math.ceil(k / 2) * SHIFT_FRACTION * visible.width * (k % 2 === 1 ? 1 : -1);
    for (const dyFraction of VERTICAL_OFFSETS) {
      const pos = clampInto(
        centerX + shift - width / 2,
        centerY + dyFraction * visible.height - height / 2,
        width,
        height,
        bounds,
      );
      const candidate: Rect = { ...pos, width, height };
      const overlap = existing.reduce((sum, r) => sum + overlapArea(candidate, r), 0);
      if (overlap < bestOverlap) {
        best = candidate;
        bestOverlap = overlap;
      }
      if (overlap <= ACCEPTABLE_OVERLAP * area) break search;
    }
  }
  return { ...(best as Rect), rotation: 0 };
}

export function startingZIndex(group: StylebookGroup, subcategory: string, existingCount: number): number {
  return ZONE_RANK[zoneOf(group, subcategory)] * 1000 + existingCount;
}
