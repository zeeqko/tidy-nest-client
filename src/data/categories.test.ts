import { describe, expect, it } from "vitest";
import type { ApiCategory } from "../api/categories";
import { illustrationIcons, toUiCategory } from "./categories";

const api = (icon: string | null, colour: string | null = null): ApiCategory =>
  ({ id: 1, name: "X", icon, colour, stylebookGroup: null, subCategories: [] }) as unknown as ApiCategory;

describe("illustrationIcons", () => {
  it("offers the six originals plus accessories, all as svg", () => {
    expect(Object.keys(illustrationIcons).sort()).toEqual(
      ["accessories", "bags", "books", "clothes", "food", "makeup", "shoes"],
    );
    for (const src of Object.values(illustrationIcons)) expect(src).toMatch(/\.svg|data:image\/svg/);
  });
});

describe("toUiCategory", () => {
  it("resolves a stored icon name to its illustration and keeps the key", () => {
    const ui = toUiCategory(api("accessories"));
    expect(ui.iconSrc).toBe(illustrationIcons.accessories);
    expect(ui.iconKey).toBe("accessories");
  });

  it("keeps the key for custom lucide icons too", () => {
    const ui = toUiCategory(api("heart"));
    expect(ui.iconSrc).toBeUndefined();
    expect(ui.iconName).toBe("heart");
    expect(ui.iconKey).toBe("heart");
  });
});
