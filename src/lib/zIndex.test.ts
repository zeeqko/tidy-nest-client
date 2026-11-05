import { describe, expect, it } from "vitest";
import { normalizeZIndices } from "./zIndex";

const z = (items: { zIndex: number }[]) => items.map((i) => i.zIndex);

describe("normalizeZIndices", () => {
  it("returns an empty array for no items", () => {
    expect(normalizeZIndices([])).toEqual([]);
  });

  it("maps a single item to 0", () => {
    expect(normalizeZIndices([{ id: "a", zIndex: 3000 }])).toEqual([{ id: "a", zIndex: 0 }]);
  });

  it("closes gaps while keeping array order and stacking order", () => {
    const items = [
      { id: "top", zIndex: 1000 },
      { id: "bottom", zIndex: 1 },
      { id: "bag", zIndex: 3002 },
      { id: "coat", zIndex: 2000 },
    ];
    const out = normalizeZIndices(items);
    expect(out.map((i) => i.id)).toEqual(["top", "bottom", "bag", "coat"]);
    expect(z(out)).toEqual([1, 0, 3, 2]);
  });

  it("handles negative values (send to back)", () => {
    expect(z(normalizeZIndices([{ zIndex: 0 }, { zIndex: -1 }, { zIndex: 1001 }, { zIndex: -2 }]))).toEqual([2, 1, 3, 0]);
  });

  it("breaks ties by array order (earlier stays below)", () => {
    expect(z(normalizeZIndices([{ zIndex: 5 }, { zIndex: 5 }, { zIndex: 1 }, { zIndex: 5 }]))).toEqual([1, 2, 0, 3]);
  });

  it("does not mutate the input and keeps other fields", () => {
    const items = [{ id: "a", x: 7, zIndex: 9 }];
    const out = normalizeZIndices(items);
    expect(items[0].zIndex).toBe(9);
    expect(out[0]).toEqual({ id: "a", x: 7, zIndex: 0 });
    expect(out[0]).not.toBe(items[0]);
  });
});
