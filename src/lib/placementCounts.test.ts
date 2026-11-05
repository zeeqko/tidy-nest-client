import { describe, expect, it } from "vitest";
import { countsByItemId, lastPlacementId } from "./placementCounts";

const items = [
  { id: "p1", itemId: "a" },
  { id: "p2", itemId: "b" },
  { id: "p3", itemId: "a" },
];

describe("countsByItemId", () => {
  it("counts placements per inventory item", () => {
    expect(countsByItemId(items)).toEqual({ a: 2, b: 1 });
  });

  it("is empty for no placements", () => {
    expect(countsByItemId([])).toEqual({});
  });
});

describe("lastPlacementId", () => {
  it("returns the last placement of the item in array order", () => {
    expect(lastPlacementId(items, "a")).toBe("p3");
    expect(lastPlacementId(items, "b")).toBe("p2");
  });

  it("returns null when the item is not placed", () => {
    expect(lastPlacementId(items, "z")).toBeNull();
    expect(lastPlacementId([], "a")).toBeNull();
  });
});
