import { describe, expect, it } from "vitest";
import type { Category, OrganizingItem } from "../types";
import type { PickerFilter } from "./pickerFilter";
import {
  buildGroupMap,
  clampSheetHeight,
  clearedFilter,
  emptyStateMessage,
  hasActiveFilters,
  mergedTagCounts,
  nextSnapOnTap,
  pickSnap,
  snapHeights,
  subcategoryChips,
  toggleTag,
  visibleTagChips,
} from "./pickerModel";

function cat(id: string, group: Category["stylebookGroup"], subs: [string, string][]): Category {
  return {
    id,
    label: id,
    stylebookGroup: group,
    subcategories: subs.map(([sid, name]) => ({ id: sid, name })),
  } as Category;
}

function item(id: string, tags: string[]): OrganizingItem {
  return { id, tags: tags.map((label) => ({ label, bg: "", fg: "" })) } as unknown as OrganizingItem;
}

const categories = [
  cat("tops", "clothes", [["s1", "Tops"], ["s2", "Tees"]]),
  cat("bottoms", "clothes", [["s3", "Jeans"], ["s1", "Tops"]]),
  cat("shoes", "shoes", [["s4", "Sneakers"]]),
  cat("kitchen", undefined, [["s5", "Pans"]]),
];

const base: PickerFilter = { group: "clothes", subcategoryId: null, tags: [], query: "" };

describe("buildGroupMap", () => {
  it("maps only categories with a group", () => {
    const map = buildGroupMap(categories);
    expect([...map]).toEqual([
      ["tops", "clothes"],
      ["bottoms", "clothes"],
      ["shoes", "shoes"],
    ]);
  });
});

describe("subcategoryChips", () => {
  it("unions subcategories of every category in the group, de-duplicated by id", () => {
    expect(subcategoryChips(categories, "clothes")).toEqual([
      { id: "s1", name: "Tops" },
      { id: "s2", name: "Tees" },
      { id: "s3", name: "Jeans" },
    ]);
  });
  it("is empty for a group with no categories", () => {
    expect(subcategoryChips(categories, "bags")).toEqual([]);
  });
});

describe("mergedTagCounts", () => {
  it("merges case variants with first-seen casing and summed counts", () => {
    const items = [item("1", ["Linen", "Summer"]), item("2", ["linen"]), item("3", ["LINEN", "summer"])];
    expect(mergedTagCounts(items)).toEqual([
      { name: "Linen", count: 3 },
      { name: "Summer", count: 2 },
    ]);
  });
  it("counts an item once even if it carries two variants", () => {
    expect(mergedTagCounts([item("1", ["Linen", "linen"])])).toEqual([{ name: "Linen", count: 1 }]);
  });
  it("merges before applying the limit", () => {
    const items = [item("1", ["a", "B"]), item("2", ["b"]), item("3", ["c"])];
    expect(mergedTagCounts(items, 1)).toEqual([{ name: "B", count: 2 }]);
  });
  it("sorts by count desc then name", () => {
    const items = [item("1", ["zeta", "alpha"]), item("2", ["mid"]), item("3", ["mid"])];
    expect(mergedTagCounts(items).map((t) => t.name)).toEqual(["mid", "alpha", "zeta"]);
  });
});

describe("toggleTag / visibleTagChips", () => {
  it("toggles case-insensitively", () => {
    expect(toggleTag([], "Linen")).toEqual(["Linen"]);
    expect(toggleTag(["Linen"], "linen")).toEqual([]);
  });
  it("keeps selected tags visible and first even when not in the top list", () => {
    const top = [
      { name: "summer", count: 4 },
      { name: "linen", count: 2 },
    ];
    expect(visibleTagChips(top, ["Vintage", "Linen"], 3)).toEqual([
      { name: "Vintage", count: null, active: true },
      { name: "Linen", count: 2, active: true },
      { name: "summer", count: 4, active: false },
    ]);
  });
  it("respects the limit for unselected tags", () => {
    const top = [
      { name: "a", count: 3 },
      { name: "b", count: 2 },
      { name: "c", count: 1 },
    ];
    expect(visibleTagChips(top, [], 2).map((c) => c.name)).toEqual(["a", "b"]);
  });
});

describe("snapping", () => {
  const heights = snapHeights(800);
  it("computes peek/half/full", () => {
    expect(heights).toEqual({ peek: 96, half: 400, full: 720 });
  });
  it("never lets half/full drop below peek on tiny viewports", () => {
    const h = snapHeights(100);
    expect(h.half).toBeGreaterThanOrEqual(96);
    expect(h.full).toBeGreaterThanOrEqual(h.half);
  });
  it("picks the nearest snap with no velocity", () => {
    expect(pickSnap(150, 0, heights)).toBe("peek");
    expect(pickSnap(380, 0, heights)).toBe("half");
    expect(pickSnap(600, 0, heights)).toBe("full");
  });
  it("biases toward the direction of a flick", () => {
    expect(pickSnap(420, 2, heights)).toBe("full");
    expect(pickSnap(380, -2, heights)).toBe("peek");
  });
  it("clamps drag height to [peek, full]", () => {
    expect(clampSheetHeight(10, heights)).toBe(96);
    expect(clampSheetHeight(5000, heights)).toBe(720);
  });
  it("tap toggles between peek and half", () => {
    expect(nextSnapOnTap("peek")).toBe("half");
    expect(nextSnapOnTap("half")).toBe("peek");
    expect(nextSnapOnTap("full")).toBe("peek");
  });
});

describe("filters and empty states", () => {
  it("detects active filters and clears them but keeps the group", () => {
    expect(hasActiveFilters(base)).toBe(false);
    expect(hasActiveFilters({ ...base, query: "  " })).toBe(false);
    expect(hasActiveFilters({ ...base, tags: ["x"] })).toBe(true);
    expect(clearedFilter({ group: "shoes", subcategoryId: "s4", tags: ["x"], query: "q" })).toEqual({
      group: "shoes",
      subcategoryId: null,
      tags: [],
      query: "",
    });
  });
  it("says no categories are set up when none has a group", () => {
    const msg = emptyStateMessage({ hasGroupedCategory: false, filter: base, subcategoryName: null });
    expect(msg.heading).toBe("No categories are set up for Stylebook yet");
    expect(msg.body).toMatch(/category form/);
    expect(msg.showClear).toBe(false);
  });
  it("plain empty group has no clear button", () => {
    const msg = emptyStateMessage({ hasGroupedCategory: true, filter: { ...base, group: "bags" }, subcategoryName: null });
    expect(msg.heading).toBe("No pieces here yet");
    expect(msg.body).toMatch(/Bags/);
    expect(msg.showClear).toBe(false);
  });
  it("names tags and subcategory", () => {
    const msg = emptyStateMessage({
      hasGroupedCategory: true,
      filter: { ...base, subcategoryId: "s1", tags: ["summer"] },
      subcategoryName: "Tops",
    });
    expect(msg.body).toBe("No pieces with #summer in Tops.");
    expect(msg.showClear).toBe(true);
  });
  it("names query and tags, spanning all groups", () => {
    const msg = emptyStateMessage({
      hasGroupedCategory: true,
      filter: { ...base, subcategoryId: "s1", tags: ["summer"], query: " linen " },
      subcategoryName: "Tops",
    });
    expect(msg.body).toBe('No pieces matching "linen" with #summer in any group.');
    expect(msg.showClear).toBe(true);
  });
});
