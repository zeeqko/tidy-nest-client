/** Longest auto name, in user-perceived characters. */
export const AUTO_NAME_MAX = 40;

const FALLBACK_NAME = "Untitled look";

/** Trims and collapses every run of whitespace to a single space. */
function collapse(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Splits into user-perceived characters (grapheme clusters) where the
 *  runtime supports it, else into code points — either way a cut never
 *  lands inside a surrogate pair (emoji, rare CJK). */
function characters(value: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(value), (s) => s.segment);
  }
  return Array.from(value);
}

/** Cuts `value` to at most `max` characters, at the last space when there is
 *  one inside the limit, with no trailing space. */
function shorten(value: string, max: number): string {
  const chars = characters(value);
  if (chars.length <= max) return value;
  const head = chars.slice(0, max);
  // The cut already falls on a word boundary when the next character is a space.
  if (chars[max] !== " ") {
    const lastSpace = head.lastIndexOf(" ");
    if (lastSpace > 0) return head.slice(0, lastSpace).join("").trimEnd();
  }
  return head.join("").trimEnd();
}

/**
 * Suggested name for a look, used when the user hasn't typed one.
 *
 * - A non-blank occasion wins: `"<occasion> look"`.
 * - Otherwise the first piece's name: `"<first piece> look"`.
 * - Otherwise (no pieces, or a blank first name): `"Untitled look"`.
 *
 * Whitespace is trimmed and collapsed, and the result is cut to at most 40
 * characters (at a word boundary when possible). Never empty.
 */
export function autoLookName(pieceNames: string[], occasion: string): string {
  const occ = collapse(occasion);
  const first = collapse(pieceNames[0] ?? "");
  const base = occ ? `${occ} look` : first ? `${first} look` : FALLBACK_NAME;
  return shorten(base, AUTO_NAME_MAX) || FALLBACK_NAME;
}
