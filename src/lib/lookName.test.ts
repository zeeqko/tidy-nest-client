import { describe, expect, it } from "vitest";
import { AUTO_NAME_MAX, autoLookName } from "./lookName";

const graphemes = (value: string) =>
  Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value), (s) => s.segment);

describe("autoLookName", () => {
  it("falls back to 'Untitled look' with no pieces and no occasion", () => {
    expect(autoLookName([], "")).toBe("Untitled look");
  });

  it("treats a whitespace-only occasion as no occasion", () => {
    expect(autoLookName([], "   \t ")).toBe("Untitled look");
    expect(autoLookName(["Linen Shirt"], "  ")).toBe("Linen Shirt look");
  });

  it("names the look after the first piece", () => {
    expect(autoLookName(["Linen Shirt", "Denim Jacket"], "")).toBe("Linen Shirt look");
  });

  it("falls back when the first piece's name is blank", () => {
    expect(autoLookName(["   ", "Denim Jacket"], "")).toBe("Untitled look");
  });

  it("lets the occasion beat the pieces", () => {
    expect(autoLookName(["Linen Shirt"], "Work")).toBe("Work look");
    expect(autoLookName([], "Date Night")).toBe("Date Night look");
  });

  it("trims and collapses whitespace", () => {
    expect(autoLookName(["  Linen    Shirt \n "], "")).toBe("Linen Shirt look");
    expect(autoLookName([], "  Date   Night ")).toBe("Date Night look");
  });

  it("cuts long names at a word boundary, with no trailing space", () => {
    const name = autoLookName(["Oversized Organic Cotton Button Down Oxford Shirt"], "");
    expect(name).toBe("Oversized Organic Cotton Button Down");
    expect(name.length).toBeLessThanOrEqual(AUTO_NAME_MAX);
    expect(name).toBe(name.trim());
  });

  it("keeps an exact cut when the next character is a space", () => {
    // 40 characters, then " look".
    const forty = "Abcdefghij Abcdefghij Abcdefghij Abcdefg";
    expect(forty).toHaveLength(40);
    expect(autoLookName([forty], "")).toBe(forty);
  });

  it("hard-cuts a single long word", () => {
    const name = autoLookName(["A".repeat(60)], "");
    expect(name).toBe("A".repeat(40));
  });

  it("keeps a name of exactly 40 characters whole", () => {
    const name = autoLookName(["Abcdefghij Abcdefghij Abcdefghij A"], ""); // 34 + " look" = 39
    expect(name).toBe("Abcdefghij Abcdefghij Abcdefghij A look");
    const exact = autoLookName(["Abcdefghij Abcdefghij Abcdefghij Ab"], ""); // 35 + 5 = 40
    expect(exact).toBe("Abcdefghij Abcdefghij Abcdefghij Ab look");
  });

  it("never splits emoji or CJK characters", () => {
    const emoji = autoLookName(["👗".repeat(50)], "");
    expect(graphemes(emoji)).toHaveLength(40);
    expect(graphemes(emoji).every((c) => c === "👗")).toBe(true);

    const family = autoLookName(["👩‍👩‍👧".repeat(45)], "");
    expect(graphemes(family).every((c) => c === "👩‍👩‍👧")).toBe(true);
    expect(graphemes(family)).toHaveLength(40);

    const cjk = autoLookName(["𠀋亜麻のシャツ".repeat(8)], "");
    expect(graphemes(cjk)).toHaveLength(40);
    expect(cjk.startsWith("𠀋亜麻のシャツ")).toBe(true);
    // No lone surrogate anywhere.
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(cjk)).toBe(false);

    expect(autoLookName(["麻のシャツ 🌸"], "")).toBe("麻のシャツ 🌸 look");
  });

  it("is never empty", () => {
    for (const [pieces, occasion] of [
      [[], ""],
      [[""], " "],
      [[" "], "\n"],
    ] as const) {
      expect(autoLookName([...pieces], occasion).length).toBeGreaterThan(0);
    }
  });
});
