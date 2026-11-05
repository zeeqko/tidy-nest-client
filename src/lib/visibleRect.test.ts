import { describe, expect, it } from "vitest";
import { FULL_SPACE, MIN_VISIBLE_HEIGHT, placementArea } from "./visibleRect";

describe("placementArea", () => {
  it("uses the whole space before the canvas reports a rect", () => {
    expect(placementArea(null)).toEqual(FULL_SPACE);
  });

  it("uses the reported visible rect when it is tall enough", () => {
    const rect = { x: 0, y: 0, width: 400, height: 300 };
    expect(placementArea(rect)).toBe(rect);
    const exact = { x: 0, y: 0, width: 400, height: MIN_VISIBLE_HEIGHT };
    expect(placementArea(exact)).toBe(exact);
  });

  it("falls back to the whole space when the sheet covers nearly everything", () => {
    expect(placementArea({ x: 0, y: 0, width: 400, height: 0 })).toEqual(FULL_SPACE);
    expect(placementArea({ x: 0, y: 0, width: 400, height: MIN_VISIBLE_HEIGHT - 1 })).toEqual(
      FULL_SPACE,
    );
    expect(placementArea({ x: 0, y: 0, width: 0, height: 500 })).toEqual(FULL_SPACE);
  });
});
