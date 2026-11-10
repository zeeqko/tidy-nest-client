import { describe, expect, it } from "vitest";
import { resolveCategoryColour } from "./categoryColour";

describe("resolveCategoryColour", () => {
  it("prefers the colour stored on the category", () => {
    expect(resolveCategoryColour("#C9B6FF", "food")).toBe("#C9B6FF");
  });

  it("falls back to the built-in icon's own colour when none is stored", () => {
    expect(resolveCategoryColour(undefined, "food")).toBe("#F7C548");
    expect(resolveCategoryColour(undefined, "accessories")).toBe("#E879C6");
  });

  it("returns undefined for a custom icon with no colour, so the tile keeps its neutral look", () => {
    expect(resolveCategoryColour(undefined, "heart")).toBeUndefined();
    expect(resolveCategoryColour(undefined, undefined)).toBeUndefined();
  });
});
