import { describe, expect, it } from "vitest";
import { seedOccasions } from "../data/occasions";
import { ALL_OCCASIONS, filterLooks, lookCountLabel, lookTileLabel, occasionFilters } from "./styleBookList";

const look = (name: string, occasion: string) => ({ name, occasion });

describe("occasionFilters", () => {
  it("is All + the seed occasions when there are no looks", () => {
    expect(occasionFilters([])).toEqual([ALL_OCCASIONS, ...seedOccasions]);
  });

  it("appends distinct extra occasions in first-seen order, skipping seeds and empty ones", () => {
    const looks = [look("a", "Brunch"), look("b", "Work"), look("c", ""), look("d", "Gym"), look("e", "Brunch")];
    expect(occasionFilters(looks)).toEqual([ALL_OCCASIONS, ...seedOccasions, "Brunch", "Gym"]);
  });

  it("trims occasions: whitespace-only is no occasion, padded ones merge with their trimmed form", () => {
    const looks = [look("a", "   "), look("b", " Brunch "), look("c", "Brunch"), look("d", " Work")];
    expect(occasionFilters(looks)).toEqual([ALL_OCCASIONS, ...seedOccasions, "Brunch"]);
  });
});

describe("filterLooks", () => {
  const looks = [look("a", "Work"), look("b", "Casual"), look("c", "Work"), look("d", "")];

  it("keeps every look for All", () => {
    expect(filterLooks(looks, ALL_OCCASIONS)).toBe(looks);
  });

  it("keeps only exact occasion matches", () => {
    expect(filterLooks(looks, "Work").map((l) => l.name)).toEqual(["a", "c"]);
    expect(filterLooks(looks, "Formal")).toEqual([]);
  });

  it("compares trimmed occasions, so padded looks match and blank ones match no occasion", () => {
    const padded = [look("a", " Work "), look("b", "  "), look("c", "Work")];
    expect(filterLooks(padded, "Work").map((l) => l.name)).toEqual(["a", "c"]);
    expect(filterLooks(padded, "Formal")).toEqual([]);
  });
});

describe("lookCountLabel", () => {
  it("pluralises everything but one", () => {
    expect(lookCountLabel(0)).toBe("0 looks");
    expect(lookCountLabel(1)).toBe("1 look");
    expect(lookCountLabel(12)).toBe("12 looks");
  });
});

describe("lookTileLabel", () => {
  it("is name, occasion", () => {
    expect(lookTileLabel(look("Linen summer", "Casual"))).toBe("Linen summer, Casual");
  });

  it("omits an empty or blank occasion", () => {
    expect(lookTileLabel(look("Margin Look", ""))).toBe("Margin Look");
    expect(lookTileLabel(look("Margin Look", "  "))).toBe("Margin Look");
  });
});
