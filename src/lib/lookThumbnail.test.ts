import { describe, expect, it } from "vitest";
import { thumbnailLayout } from "./lookThumbnail";

const at = (x: number, y: number, width: number, height: number, rotation = 0) => ({ x, y, width, height, rotation });

describe("thumbnailLayout", () => {
  it("returns nothing for no items", () => {
    expect(thumbnailLayout([])).toEqual([]);
  });

  it("fits a single unrotated item to the full square on its long axis, centred on the other", () => {
    const [box] = thumbnailLayout([at(50, 100, 100, 200)]);
    expect(box.topPct).toBeCloseTo(0);
    expect(box.heightPct).toBeCloseTo(100);
    expect(box.widthPct).toBeCloseTo(50);
    expect(box.leftPct).toBeCloseTo(25);
  });

  it("crops to the rotated bounds so a rotated corner is not clipped", () => {
    // A 100x100 square rotated 45deg has a ~141.42 wide rotated box.
    const [box] = thumbnailLayout([at(0, 0, 100, 100, 45)]);
    const diag = 100 * Math.SQRT2;
    expect(box.widthPct).toBeCloseTo((100 / diag) * 100);
    // Centred: the unrotated rect sits inside the rotated box.
    expect(box.leftPct).toBeCloseTo(((diag - 100) / 2 / diag) * 100);
    expect(box.topPct).toBeCloseTo(((diag - 100) / 2 / diag) * 100);
    // Rotated extents stay within 0..100%.
    const half = (diag / 2 / diag) * 100;
    const cx = box.leftPct + box.widthPct / 2;
    expect(cx - half).toBeGreaterThanOrEqual(-1e-9);
    expect(cx + half).toBeLessThanOrEqual(100 + 1e-9);
  });

  it("keeps input order and extra fields", () => {
    const out = thumbnailLayout([
      { ...at(0, 0, 10, 10), id: "a", zIndex: 2 },
      { ...at(90, 0, 10, 10), id: "b", zIndex: 1 },
    ]);
    expect(out.map((i) => i.id)).toEqual(["a", "b"]);
    expect(out[0].leftPct).toBeCloseTo(0);
    expect(out[1].leftPct + out[1].widthPct).toBeCloseTo(100);
    // 100 wide x 10 tall span: centred vertically.
    expect(out[0].topPct).toBeCloseTo(45);
  });
});
