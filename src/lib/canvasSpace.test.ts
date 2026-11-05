import { describe, expect, it } from "vitest";
import { clampItem, fitToScreen, lookBounds } from "./canvasSpace";

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
