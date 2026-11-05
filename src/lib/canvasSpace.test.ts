import { describe, expect, it } from "vitest";
import { clampItem, fitRectToScreen, fitToScreen, lookBounds, rotatedBounds } from "./canvasSpace";

describe("fitToScreen", () => {
  it("fits a phone viewport by width", () => {
    const r = fitToScreen({ width: 390, height: 844 });
    expect(r.scale).toBeCloseTo(0.975, 6);
    expect(r.offsetX).toBeCloseTo(0, 6);
    expect(r.offsetY).toBeCloseTo((844 - 711 * 0.975) / 2, 6);
  });
  it("fits a landscape viewport by height and centres horizontally", () => {
    const r = fitToScreen({ width: 800, height: 600 });
    expect(r.scale).toBeCloseTo(600 / 711, 6);
    expect(r.offsetX).toBeCloseTo((800 - 400 * (600 / 711)) / 2, 6);
    expect(r.offsetY).toBeCloseTo(0, 6);
  });
  it("never returns a negative scale for negative viewport values", () => {
    expect(fitToScreen({ width: -10, height: 500 }).scale).toBe(0);
    expect(fitToScreen({ width: 400, height: -1 }).scale).toBe(0);
    expect(fitToScreen({ width: -400, height: -711 }).scale).toBe(0);
  });
});

describe("clampItem", () => {
  it("translates an item back inside on the right edge", () => {
    const r = clampItem({ x: 390, y: 10, width: 100, height: 100, rotation: 0 });
    expect(r.x).toBe(300);
    expect(r.y).toBe(10);
  });
  it("accounts for rotation", () => {
    const r = clampItem({ x: 0, y: 0, width: 100, height: 100, rotation: 45 });
    expect(r.x).toBeCloseTo(20.71, 1);
    expect(r.y).toBeCloseTo(20.71, 1);
  });
  it("leaves an inside item unchanged", () => {
    const item = { x: 50, y: 60, width: 100, height: 80, rotation: 10, id: "a" };
    expect(clampItem(item)).toEqual(item);
  });
  it("centres an item larger than the space", () => {
    const r = clampItem({ x: 0, y: 0, width: 500, height: 100, rotation: 0 });
    expect(r.x).toBeCloseTo(-50, 6);
  });
  it("uses the rotated half-width of a non-square box at rotation 90 on the right edge", () => {
    // 100x40 rotated 90 occupies 40 wide: centre must sit at 400 - 20.
    const r = clampItem({ x: 380, y: 100, width: 100, height: 40, rotation: 90 });
    expect(r.x + 50).toBeCloseTo(380, 6);
    expect(r.x).toBeCloseTo(330, 6);
    expect(r.y).toBe(100);
  });
  it.each([-45, 135])("clamps a rotation %d box at the bottom-right corner", (rotation) => {
    const half = 100 * Math.SQRT2 / 2;
    const r = clampItem({ x: 350, y: 680, width: 100, height: 100, rotation });
    expect(r.x + 50).toBeCloseTo(400 - half, 6);
    expect(r.y + 50).toBeCloseTo(711 - half, 6);
    expect(r.rotation).toBe(rotation);
  });
  it("clamps at the left edge", () => {
    const r = clampItem({ x: -30, y: 100, width: 50, height: 50, rotation: 0 });
    expect(r.x).toBe(0);
    expect(r.y).toBe(100);
  });
  it("clamps at the top edge", () => {
    const r = clampItem({ x: 100, y: -10, width: 50, height: 50, rotation: 0 });
    expect(r.x).toBe(100);
    expect(r.y).toBe(0);
  });
  it("clamps at the bottom edge", () => {
    const r = clampItem({ x: 100, y: 700, width: 50, height: 50, rotation: 0 });
    expect(r.x).toBe(100);
    expect(r.y).toBe(661);
  });
  it("centres a box taller than the space on y", () => {
    const r = clampItem({ x: 100, y: 0, width: 100, height: 800, rotation: 0 });
    expect(r.y).toBeCloseTo(711 / 2 - 400, 6);
    expect(r.x).toBe(100);
  });
  it("returns an inside item with fractional coordinates unchanged", () => {
    const item = { x: 12.3, y: 45.6, width: 100, height: 80, rotation: 0 };
    const r = clampItem(item);
    expect(r).toBe(item);
    expect(r.x).toBe(12.3);
    expect(r.y).toBe(45.6);
  });
});

describe("lookBounds", () => {
  it("returns the padded union", () => {
    const r = lookBounds(
      [
        { x: 10, y: 20, width: 30, height: 40 },
        { x: 100, y: 50, width: 20, height: 100 },
      ],
      10,
    );
    expect(r).toEqual({ x: 0, y: 10, width: 130, height: 150 });
  });
  it("returns a zero rect for no items", () => {
    expect(lookBounds([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe("fitRectToScreen", () => {
  const rect = { x: 100, y: 200, width: 200, height: 100 };

  it("fits a wide rect by width in a taller viewport, centred vertically", () => {
    const r = fitRectToScreen({ width: 400, height: 400 }, rect);
    expect(r.scale).toBe(2);
    // rect left edge lands at x=0, rect is vertically centred
    expect(100 * r.scale + r.offsetX).toBeCloseTo(0);
    expect(200 * r.scale + r.offsetY).toBeCloseTo(100);
  });

  it("fits by height in a wider viewport, centred horizontally", () => {
    const r = fitRectToScreen({ width: 800, height: 100 }, rect);
    expect(r.scale).toBe(1);
    expect(100 * r.scale + r.offsetX).toBeCloseTo(300);
    expect(200 * r.scale + r.offsetY).toBeCloseTo(0);
  });

  it("supports a rect partly outside the design space", () => {
    const r = fitRectToScreen({ width: 100, height: 100 }, { x: -50, y: -50, width: 100, height: 100 });
    expect(r.scale).toBe(1);
    expect(r.offsetX).toBe(50);
    expect(r.offsetY).toBe(50);
  });

  it("falls back to the whole design space for a zero-size rect", () => {
    const vp = { width: 390, height: 844 };
    expect(fitRectToScreen(vp, { x: 0, y: 0, width: 0, height: 0 })).toEqual(fitToScreen(vp));
    expect(fitRectToScreen(vp, { x: 5, y: 5, width: 10, height: 0 })).toEqual(fitToScreen(vp));
  });

  it("yields zero scale for a degenerate viewport", () => {
    const r = fitRectToScreen({ width: -10, height: 500 }, rect);
    expect(r.scale).toBe(0);
    expect(r.offsetX).toBeCloseTo(-5);
    expect(r.offsetY).toBeCloseTo(250);
  });

  it("equals fitToScreen for the whole-space rect", () => {
    const vp = { width: 390, height: 844 };
    expect(fitRectToScreen(vp, { x: 0, y: 0, width: 400, height: 711 })).toEqual(fitToScreen(vp));
  });
});

describe("rotatedBounds", () => {
  const p = (x: number, y: number, width: number, height: number, rotation: number) => ({
    x, y, width, height, rotation,
  });

  it("equals lookBounds at rotation 0", () => {
    const items = [p(10, 20, 100, 40, 0), p(200, 300, 50, 80, 0)];
    expect(rotatedBounds(items, 24)).toEqual(lookBounds(items, 24));
  });

  it("swaps extents at 90deg", () => {
    // centred at (0,0): x=-50, y=-20
    const r = rotatedBounds([p(-50, -20, 100, 40, 90)]);
    expect(r.x).toBeCloseTo(-20);
    expect(r.y).toBeCloseTo(-50);
    expect(r.width).toBeCloseTo(40);
    expect(r.height).toBeCloseTo(100);
  });

  it("uses the diagonal at 45deg", () => {
    const r = rotatedBounds([p(-50, -50, 100, 100, 45)]);
    expect(r.x).toBeCloseTo(-70.71, 2);
    expect(r.y).toBeCloseTo(-70.71, 2);
    expect(r.width).toBeCloseTo(141.42, 2);
  });

  it("returns a zero rect for no items", () => {
    expect(rotatedBounds([], 24)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("applies padding on all sides", () => {
    const r = rotatedBounds([p(10, 20, 100, 40, 0)], 5);
    expect(r).toEqual({ x: 5, y: 15, width: 110, height: 50 });
  });

  it("unions rotated and unrotated items", () => {
    const r = rotatedBounds([p(0, 0, 100, 100, 0), p(150, -50, 100, 40, 90)]);
    // second: centre (200,-30), half extents 20 x 50 -> x 180..220, y -80..20
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(-80);
    expect(r.width).toBeCloseTo(220);
    expect(r.height).toBeCloseTo(180);
  });

  it("is symmetric for negative rotation and 135deg on a square", () => {
    const base = rotatedBounds([p(0, 0, 100, 100, 45)]);
    for (const rot of [-45, 135]) {
      const r = rotatedBounds([p(0, 0, 100, 100, rot)]);
      expect(r.x).toBeCloseTo(base.x);
      expect(r.y).toBeCloseTo(base.y);
      expect(r.width).toBeCloseTo(base.width);
      expect(r.height).toBeCloseTo(base.height);
    }
  });
});
