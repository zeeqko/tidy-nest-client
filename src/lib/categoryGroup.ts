import type { StylebookGroup } from "./placement";

/** What the Stylebook group select can hold. "auto" exists only for new
 *  categories (backend picks a default from the name); "hidden" keeps the
 *  category out of the Stylebook picker. */
export type GroupSelection = StylebookGroup | "hidden" | "auto";

/**
 * Value to send as `stylebookGroup`, or undefined to omit the field.
 * Omitting leaves the stored value unchanged on update and applies the
 * name-based default on create, so an untouched select must send nothing.
 */
export function groupPayloadValue(
  selection: GroupSelection,
  touched: boolean,
): StylebookGroup | "" | undefined {
  if (!touched || selection === "auto") return undefined;
  return selection === "hidden" ? "" : selection;
}
