import { describe, expect, it } from "vitest";
import { DESIGN_HEIGHT, DESIGN_WIDTH, type Rect } from "./canvasSpace";
import { placeItem, startingZIndex } from "./placement";

const visible: Rect = { x: 0, y: 0, width: 400, height: 400 };

function inside(r: Rect, v: Rect) {
  expect(r.x).toBeGreaterThanOrEqual(v.x - 1e-9);
  expect(r.y).toBeGreaterThanOrEqual(v.y - 1e-9);
  expect(r.x + r.width).toBeLessThanOrEqual(v.x + v.width + 1e-9);
  expect(r.y + r.height).toBeLessThanOrEqual(v.y + v.height + 1e-9);
}
const cy = (r: Rect) => r.y + r.height / 2;
const longest = (r: Rect) => Math.max(r.width, r.height);
function overlapArea(a: Rect, b: Rect) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
const item = (group: "clothes" | "shoes" | "accessories" | "bags", subcategory: string, aspect = 0.75) => ({
  group,
  subcategory,
  aspect,
});

describe("placeItem", () => {
  it("stays inside visible with rotation 0", () => {
    const p = placeItem(item("clothes", "Tops"), [], visible);
    inside(p, visible);
    expect(p.rotation).toBe(0);
  });

  it("orders tops above bottoms above shoes", () => {
    const t = placeItem(item("clothes", "Tops"), [], visible);
    const b = placeItem(item("clothes", "Pants"), [], visible);
    const s = placeItem(item("shoes", "Sneakers"), [], visible);
    expect(cy(t)).toBeLessThan(cy(b));
    expect(cy(b)).toBeLessThan(cy(s));
  });

  it("uses the longest side per group", () => {
    expect(longest(placeItem(item("clothes", "Tops"), [], visible))).toBeCloseTo(200);
    expect(longest(placeItem(item("shoes", "Sneakers", 1.5), [], visible))).toBeCloseTo(120);
    expect(longest(placeItem(item("accessories", "Hats"), [], visible))).toBeCloseTo(80);
    expect(longest(placeItem(item("bags", "Totes"), [], visible))).toBeCloseTo(112);
  });

  it("puts accessories left and bags right", () => {
    const a = placeItem(item("accessories", "Hats"), [], visible);
    const g = placeItem(item("bags", "Totes"), [], visible);
    expect(a.x + a.width / 2).toBeLessThan(200);
    expect(g.x + g.width / 2).toBeGreaterThan(200);
  });

  it("places outerwear above tops", () => {
    const tall: Rect = { x: 0, y: 0, width: 400, height: 700 };
    const o = placeItem(item("clothes", "Jackets"), [], tall);
    const t = placeItem(item("clothes", "Tops"), [], tall);
    expect(cy(o)).toBeLessThan(cy(t));
  });

  it("keeps square tops under 50% overlap with each existing item", () => {
    const placed: Rect[] = [];
    for (let i = 0; i < 3; i++) {
      const next = placeItem(item("clothes", "Tops", 1), placed, visible);
      inside(next, visible);
      if (i > 0) {
        for (const r of placed) {
          expect(overlapArea(r, next) / (next.width * next.height)).toBeLessThan(0.5);
        }
      }
      placed.push(next);
    }
  });

  it("handles very wide and very tall aspects", () => {
    const wide = placeItem(item("clothes", "Tops", 10), [], visible);
    const tall = placeItem(item("clothes", "Tops", 0.1), [], visible);
    inside(wide, visible);
    inside(tall, visible);
    expect(wide.width).toBeCloseTo(200);
    expect(tall.height).toBeCloseTo(200);
  });

  it("terminates with many existing items and stays inside", () => {
    const existing: Rect[] = [];
    for (let i = 0; i < 50; i++) existing.push(placeItem(item("clothes", "Tops"), existing, visible));
    for (const r of existing) inside(r, visible);
  });

  it("shrinks into a visible area smaller than the natural size", () => {
    const small: Rect = { x: 10, y: 20, width: 40, height: 30 };
    const p = placeItem(item("clothes", "Tops", 0.5), [], small);
    inside(p, small);
  });

  it("stays inside the design space and visible when offset", () => {
    const v: Rect = { x: 50, y: 100, width: 300, height: 500 };
    for (const sub of ["Tops", "Pants", "Coats"]) {
      const p = placeItem(item("clothes", sub), [], v);
      inside(p, v);
      inside(p, { x: 0, y: 0, width: DESIGN_WIDTH, height: DESIGN_HEIGHT });
    }
  });
});

describe("startingZIndex", () => {
  it("ranks layers", () => {
    expect(startingZIndex("clothes", "Outerwear", 0)).toBeGreaterThan(startingZIndex("clothes", "Tops", 5));
    expect(startingZIndex("bags", "Totes", 0)).toBeGreaterThan(startingZIndex("clothes", "Jacket", 0));
    expect(startingZIndex("clothes", "Tops", 0)).toBeGreaterThan(startingZIndex("clothes", "Jeans", 0));
    expect(startingZIndex("shoes", "Boots", 3)).toBe(3);
    expect(startingZIndex("accessories", "Hats", 2)).toBe(3002);
  });
});
