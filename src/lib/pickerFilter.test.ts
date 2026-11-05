import { describe, expect, it } from "vitest";
import type { OrganizingItem } from "../types";
import type { StylebookGroup } from "./placement";
import { filterItems, topTags, type PickerFilter } from "./pickerFilter";

function item(
  id: string,
  name: string,
  categoryId: string | null,
  subCategoryId: string | null,
  subcategory: string,
  tags: string[] = [],
): OrganizingItem {
  return {
    id,
    name,
    categoryId,
    subCategoryId,
    subcategory,
    tags: tags.map((label) => ({ label, bg: "", fg: "" })),
  } as unknown as OrganizingItem;
}

const groups = new Map<string, StylebookGroup>([
  ["c-clothes", "clothes"],
  ["c-shoes", "shoes"],
]);

const items = [
  item("1", "Blue Shirt", "c-clothes", "s-tops", "Tops", ["Summer", "Cotton"]),
  item("2", "Red Dress", "c-clothes", "s-dress", "Dresses", ["Summer"]),
  item("3", "Sneakers", "c-shoes", "s-sneak", "Sneakers", ["Cotton"]),
  item("4", "Orphan", null, null, "", ["Summer"]),
  item("5", "Unmapped", "c-other", "s-x", "Misc", ["Summer"]),
];

const base: PickerFilter = { group: "clothes", subcategoryId: null, tags: [], query: "" };
const ids = (r: OrganizingItem[]) => r.map((i) => i.id);

describe("filterItems", () => {
  it("returns empty for no items", () => {
    expect(filterItems([], groups, base)).toEqual([]);
  });
  it("shows only the selected group and never unmapped items", () => {
    expect(ids(filterItems(items, groups, base))).toEqual(["1", "2"]);
    expect(ids(filterItems(items, groups, { ...base, group: "shoes" }))).toEqual(["3"]);
  });
  it("narrows by subcategory", () => {
    expect(ids(filterItems(items, groups, { ...base, subcategoryId: "s-dress" }))).toEqual(["2"]);
  });
  it("narrows by multiple tags with AND, case-insensitively", () => {
    expect(ids(filterItems(items, groups, { ...base, tags: ["summer"] }))).toEqual(["1", "2"]);
    expect(ids(filterItems(items, groups, { ...base, tags: ["Summer", "COTTON"] }))).toEqual(["1"]);
  });
  it("query matches name, tag and subcategory across all groups, case-insensitively", () => {
    const q = (query: string) => ids(filterItems(items, groups, { ...base, query }));
    expect(q("  SNEAK ")).toEqual(["3"]);
    expect(q("shirt")).toEqual(["1"]);
    expect(q("cotton")).toEqual(["1", "3"]);
    expect(q("dresses")).toEqual(["2"]);
    expect(q("summer")).toEqual(["1", "2"]);
  });
  it("whitespace-only query is treated as empty", () => {
    expect(ids(filterItems(items, groups, { ...base, query: "   " }))).toEqual(["1", "2"]);
  });
  it("query ignores group and subcategory but still applies tags", () => {
    const f = { ...base, subcategoryId: "s-dress", query: "cotton", tags: ["summer"] };
    expect(ids(filterItems(items, groups, f))).toEqual(["1"]);
  });
});

describe("topTags", () => {
  it("returns [] for no items or no tags", () => {
    expect(topTags([])).toEqual([]);
    expect(topTags([item("1", "a", null, null, "")])).toEqual([]);
  });
  it("counts, sorts by count desc then name, ignoring duplicates within an item", () => {
    const list = [
      item("1", "a", null, null, "", ["b", "b", "a"]),
      item("2", "b", null, null, "", ["b", "c"]),
      item("3", "c", null, null, "", ["a"]),
    ];
    expect(topTags(list)).toEqual([
      { name: "a", count: 2 },
      { name: "b", count: 2 },
      { name: "c", count: 1 },
    ]);
  });
  it("respects the limit (default 6)", () => {
    const list = [item("1", "a", null, null, "", ["a", "b", "c", "d", "e", "f", "g", "h"])];
    expect(topTags(list)).toHaveLength(6);
    expect(topTags(list, 2).map((t) => t.name)).toEqual(["a", "b"]);
  });
});
