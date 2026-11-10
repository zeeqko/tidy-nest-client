import { describe, expect, it } from "vitest";
import { homeSummary } from "./homeSummary";

describe("homeSummary", () => {
  it("shows nothing while anything is still loading, so '0 things' never flashes", () => {
    expect(homeSummary({ itemCount: 0, categoryCount: 0, loading: true, itemsFailed: false })).toBeNull();
    expect(homeSummary({ itemCount: 0, categoryCount: 6, loading: true, itemsFailed: false })).toBeNull();
  });

  it("counts things across categories", () => {
    expect(homeSummary({ itemCount: 48, categoryCount: 6, loading: false, itemsFailed: false })).toBe(
      "48 things across 6 categories",
    );
  });

  it("uses singular forms", () => {
    expect(homeSummary({ itemCount: 1, categoryCount: 1, loading: false, itemsFailed: false })).toBe(
      "1 thing across 1 category",
    );
  });

  it("says nothing is stored yet when there are no items", () => {
    expect(homeSummary({ itemCount: 0, categoryCount: 6, loading: false, itemsFailed: false })).toBe(
      "Nothing tucked away yet",
    );
  });

  it("hides the line with no categories (the empty state explains it) or when items failed to load", () => {
    expect(homeSummary({ itemCount: 0, categoryCount: 0, loading: false, itemsFailed: false })).toBeNull();
    expect(homeSummary({ itemCount: 0, categoryCount: 6, loading: false, itemsFailed: true })).toBeNull();
  });
});
