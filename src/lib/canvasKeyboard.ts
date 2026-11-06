/** The subset of a KeyboardEvent `shouldDeleteOnKey` reads. */
export interface KeyEventLike {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
}

/** The subset of the focused element (`document.activeElement`) it reads. */
export interface ActiveElementLike {
  tagName: string;
  isContentEditable?: boolean;
  closest?(selector: string): unknown;
}

const TEXT_ENTRY_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const MODAL_SELECTOR = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';

/**
 * Whether a keydown should remove the canvas's selected piece: a plain
 * Delete or Backspace (no modifier, not auto-repeat, not mid IME
 * composition, not already handled) while focus is not in a text field
 * (input / textarea / select / contenteditable, e.g. the picker's search box)
 * nor inside a dialog. The caller also checks that a piece is selected.
 */
export function shouldDeleteOnKey(event: KeyEventLike, active: ActiveElementLike | null): boolean {
  if (event.key !== "Delete" && event.key !== "Backspace") return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (event.repeat || event.isComposing || event.defaultPrevented) return false;
  if (active) {
    if (TEXT_ENTRY_TAGS.has(active.tagName.toUpperCase())) return false;
    if (active.isContentEditable) return false;
    if (active.closest?.(MODAL_SELECTOR)) return false;
  }
  return true;
}

/**
 * Which history step a keydown asks for: Cmd/Ctrl+Z undoes, Cmd/Ctrl+Shift+Z
 * and Ctrl+Y redo (Meta on macOS, Ctrl elsewhere: either is accepted). Not
 * while Alt is held, on auto-repeat, mid IME composition, when already
 * handled, while focus is in a text field (so the browser's own text undo
 * keeps working) nor inside a dialog. Returns null when it is not ours.
 */
export function undoRedoFromKey(
  event: KeyEventLike,
  active: ActiveElementLike | null,
): "undo" | "redo" | null {
  if (event.altKey || event.repeat || event.isComposing || event.defaultPrevented) return null;
  if (active) {
    if (TEXT_ENTRY_TAGS.has(active.tagName.toUpperCase())) return null;
    if (active.isContentEditable) return null;
    if (active.closest?.(MODAL_SELECTOR)) return null;
  }
  const key = event.key.toLowerCase();
  if (key === "z" && (event.ctrlKey || event.metaKey)) return event.shiftKey ? "redo" : "undo";
  if (key === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey) return "redo";
  return null;
}
