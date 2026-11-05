import { describe, expect, it } from "vitest";
import { rotatedBounds } from "./canvasSpace";
import { CROSS_EXCLUSION_GAP, CROSS_HIT_SIZE, CROSS_OUTSET, crossButtonPosition } from "./crossButton";

const IDENTITY = { scale: 1, offsetX: 0, offsetY: 0 };
const BIG = { width: 1000, height: 1000 };
const HALF = CROSS_HIT_SIZE / 2;
const OUT = CROSS_OUTSET; // 11: hit-area centre is (corner.x + 11, corner.y - 11)

/** Centre of the hit area for a returned position. */
const centre = (p: { left: number; top: number }) => ({ x: p.left + HALF, y: p.top + HALF });

describe("crossButtonPosition", () => {
  it("is offset 11px outward from the corner (the visual circle's radius)", () => {
    expect(OUT).toBe(11);
  });

  it("centres the hit area at (corner.x + 11, corner.y - 11) for an unrotated piece", () => {
    const bounds = rotatedBounds([{ x: 100, y: 200, width: 80, height: 60, rotation: 0 }]);
    const p = crossButtonPosition(bounds, IDENTITY, BIG);
    expect(centre(p)).toEqual({ x: 180 + 11, y: 200 - 11 });
    expect(p).toEqual({ left: 191 - HALF, top: 189 - HALF });
  });

  it("overlaps the piece's rotated bounds by at most 11px on each axis when unclamped", () => {
    for (const rotation of [0, 30, 45, 90, 135]) {
      const bounds = rotatedBounds([{ x: 100, y: 200, width: 80, height: 60, rotation }]);
      const p = crossButtonPosition(bounds, IDENTITY, BIG);
      const overlapX = Math.min(p.left + CROSS_HIT_SIZE, bounds.x + bounds.width) - Math.max(p.left, bounds.x);
      const overlapY = Math.min(p.top + CROSS_HIT_SIZE, bounds.y + bounds.height) - Math.max(p.top, bounds.y);
      expect(overlapX, `x overlap at ${rotation}deg`).toBeCloseTo(HALF - OUT, 9);
      expect(overlapY, `y overlap at ${rotation}deg`).toBeCloseTo(HALF - OUT, 9);
      expect(overlapX).toBeLessThanOrEqual(11 + 1e-9);
      expect(overlapY).toBeLessThanOrEqual(11 + 1e-9);
    }
  });

  it("uses the rotated bounding box's top-right corner at 45 degrees", () => {
    const item = { x: 100, y: 200, width: 80, height: 60, rotation: 45 };
    const half = ((80 + 60) * Math.SQRT1_2) / 2; // halfW == halfH at 45 degrees
    const c = centre(crossButtonPosition(rotatedBounds([item]), IDENTITY, BIG));
    expect(c.x).toBeCloseTo(140 + half + OUT, 9);
    expect(c.y).toBeCloseTo(230 - half - OUT, 9);
  });

  it("swaps width and height of the box at 90 degrees", () => {
    const item = { x: 100, y: 200, width: 80, height: 60, rotation: 90 };
    // Centre (140, 230); rotated box is 60 wide, 80 tall: corner (170, 190).
    const c = centre(crossButtonPosition(rotatedBounds([item]), IDENTITY, BIG));
    expect(c.x).toBeCloseTo(170 + OUT, 9);
    expect(c.y).toBeCloseTo(190 - OUT, 9);
  });

  it("applies the stage scale and offset to the corner (the outset is in screen px)", () => {
    const bounds = { x: 100, y: 200, width: 80, height: 60 };
    const c = centre(crossButtonPosition(bounds, { scale: 0.5, offsetX: 30, offsetY: 12 }, BIG));
    expect(c).toEqual({ x: 180 * 0.5 + 30 + OUT, y: 200 * 0.5 + 12 - OUT });
  });

  it("clamps into the container on the top and right", () => {
    const container = { width: 300, height: 500 };
    // Corner at (300, 0): the hit area would stick out up and right.
    const p = crossButtonPosition({ x: 200, y: 0, width: 100, height: 50 }, IDENTITY, container);
    expect(p).toEqual({ left: 300 - CROSS_HIT_SIZE, top: 0 });
  });

  it("clamps the shifted position (not the corner) on the right and top", () => {
    const container = { width: 300, height: 500 };
    // Corner 20px inside both edges: unshifted it would fit, shifted it sticks out.
    const p = crossButtonPosition({ x: 180, y: 20, width: 100, height: 50 }, IDENTITY, container);
    expect(p).toEqual({ left: 300 - CROSS_HIT_SIZE, top: 0 });
  });

  it("clamps into the container on the left and bottom", () => {
    const container = { width: 300, height: 500 };
    // A piece mostly off to the left/bottom: its corner is at (-20, 520).
    const p = crossButtonPosition({ x: -120, y: 520, width: 100, height: 50 }, IDENTITY, container);
    expect(p).toEqual({ left: 0, top: 500 - CROSS_HIT_SIZE });
  });

  it("keeps the hit area inside for a piece partly off the container (offset stage)", () => {
    const container = { width: 390, height: 300 };
    const fit = { scale: 0.42, offsetX: 111, offsetY: 0 };
    // Piece in the board's top-right corner; the board itself is letterboxed.
    const p = crossButtonPosition({ x: 300, y: -10, width: 120, height: 80 }, fit, container);
    expect(p.left).toBeGreaterThanOrEqual(0);
    expect(p.top).toBe(0);
    expect(p.left + CROSS_HIT_SIZE).toBeLessThanOrEqual(container.width);
    expect(centre(p).x).toBeCloseTo(420 * 0.42 + 111 + OUT, 9);
  });

  it("centres the hit area on an axis where the container is smaller than it", () => {
    const p = crossButtonPosition({ x: 0, y: 0, width: 10, height: 10 }, IDENTITY, { width: 30, height: 20 });
    expect(p).toEqual({ left: (30 - CROSS_HIT_SIZE) / 2, top: (20 - CROSS_HIT_SIZE) / 2 });
  });

  it("honours a custom hit size and outset", () => {
    const p = crossButtonPosition({ x: 0, y: 100, width: 50, height: 50 }, IDENTITY, BIG, { hitSize: 60, outset: 0 });
    expect(p).toEqual({ left: 20, top: 70 });
  });

  describe("exclusions (the toolbar pill)", () => {
    const container = { width: 390, height: 400 };
    const pill = { x: 120, y: 340, width: 150, height: 48 };

    it("moves the hit area straight up above an overlapping pill", () => {
      // Corner at (200, 360): the shifted hit area still lands on the pill.
      const p = crossButtonPosition({ x: 150, y: 360, width: 50, height: 30 }, IDENTITY, container, {
        exclusions: [pill],
      });
      expect(p.left).toBe(200 + OUT - HALF);
      expect(p.top).toBe(pill.y - CROSS_EXCLUSION_GAP - CROSS_HIT_SIZE);
    });

    it("leaves the hit area alone when it does not touch the pill", () => {
      const bounds = { x: 150, y: 100, width: 50, height: 40 };
      expect(crossButtonPosition(bounds, IDENTITY, container, { exclusions: [pill] })).toEqual(
        crossButtonPosition(bounds, IDENTITY, container),
      );
      // Beside the pill (same height, horizontally clear) also stays.
      const beside = { x: 0, y: 360, width: 40, height: 30 };
      expect(crossButtonPosition(beside, IDENTITY, container, { exclusions: [pill] })).toEqual({
        left: 40 + OUT - HALF,
        top: 360 - OUT - HALF,
      });
    });

    it("lets the container edge win when it is too short for both", () => {
      const short = { width: 390, height: 60 };
      const lowPill = { x: 120, y: 20, width: 150, height: 36 };
      const p = crossButtonPosition({ x: 150, y: 30, width: 50, height: 20 }, IDENTITY, short, {
        exclusions: [lowPill],
      });
      expect(p.top).toBe(0);
    });
  });
});
