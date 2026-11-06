import { describe, expect, it } from "vitest";
import { shouldDeleteOnKey, undoRedoFromKey, type ActiveElementLike } from "./canvasKeyboard";

const body: ActiveElementLike = { tagName: "BODY", isContentEditable: false, closest: () => null };
const el = (tagName: string, extra: Partial<ActiveElementLike> = {}): ActiveElementLike => ({
  tagName,
  isContentEditable: false,
  closest: () => null,
  ...extra,
});

describe("shouldDeleteOnKey", () => {
  it("deletes on a plain Delete or Backspace with focus on the page", () => {
    expect(shouldDeleteOnKey({ key: "Delete" }, body)).toBe(true);
    expect(shouldDeleteOnKey({ key: "Backspace" }, body)).toBe(true);
    expect(shouldDeleteOnKey({ key: "Delete" }, null)).toBe(true);
  });

  it("deletes while a non-text control such as a toolbar button has focus", () => {
    expect(shouldDeleteOnKey({ key: "Delete" }, el("BUTTON"))).toBe(true);
    expect(shouldDeleteOnKey({ key: "Backspace" }, el("DIV"))).toBe(true);
  });

  it("ignores other keys", () => {
    for (const key of ["d", "Escape", "Enter", " ", "ArrowLeft", "Del"]) {
      expect(shouldDeleteOnKey({ key }, body), key).toBe(false);
    }
  });

  it("ignores the keys with any modifier held", () => {
    for (const mod of ["altKey", "ctrlKey", "metaKey", "shiftKey"] as const) {
      expect(shouldDeleteOnKey({ key: "Delete", [mod]: true }, body), mod).toBe(false);
      expect(shouldDeleteOnKey({ key: "Backspace", [mod]: true }, body), mod).toBe(false);
    }
  });

  it("ignores auto-repeat, IME composition and already-handled events", () => {
    expect(shouldDeleteOnKey({ key: "Delete", repeat: true }, body)).toBe(false);
    expect(shouldDeleteOnKey({ key: "Backspace", isComposing: true }, body)).toBe(false);
    expect(shouldDeleteOnKey({ key: "Delete", defaultPrevented: true }, body)).toBe(false);
  });

  it("never deletes while typing in a text field", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT", "input", "textarea"]) {
      expect(shouldDeleteOnKey({ key: "Backspace" }, el(tag)), tag).toBe(false);
      expect(shouldDeleteOnKey({ key: "Delete" }, el(tag)), tag).toBe(false);
    }
    expect(shouldDeleteOnKey({ key: "Backspace" }, el("DIV", { isContentEditable: true }))).toBe(false);
  });

  it("never deletes while focus is inside a dialog", () => {
    const inDialog = el("BUTTON", { closest: (s: string) => (s.includes("dialog") ? {} : null) });
    expect(shouldDeleteOnKey({ key: "Delete" }, inDialog)).toBe(false);
  });
});

describe("undoRedoFromKey", () => {
  it("maps Cmd/Ctrl+Z to undo", () => {
    expect(undoRedoFromKey({ key: "z", metaKey: true }, body)).toBe("undo");
    expect(undoRedoFromKey({ key: "z", ctrlKey: true }, body)).toBe("undo");
    expect(undoRedoFromKey({ key: "z", ctrlKey: true }, null)).toBe("undo");
  });

  it("maps Cmd/Ctrl+Shift+Z (uppercase Z when Shift is held) and Ctrl+Y to redo", () => {
    expect(undoRedoFromKey({ key: "z", metaKey: true, shiftKey: true }, body)).toBe("redo");
    expect(undoRedoFromKey({ key: "Z", metaKey: true, shiftKey: true }, body)).toBe("redo");
    expect(undoRedoFromKey({ key: "Z", ctrlKey: true, shiftKey: true }, body)).toBe("redo");
    expect(undoRedoFromKey({ key: "y", ctrlKey: true }, body)).toBe("redo");
    expect(undoRedoFromKey({ key: "Y", ctrlKey: true }, body)).toBe("redo");
  });

  it("ignores a plain z / y, Shift only, and Cmd+Y", () => {
    expect(undoRedoFromKey({ key: "z" }, body)).toBeNull();
    expect(undoRedoFromKey({ key: "Z", shiftKey: true }, body)).toBeNull();
    expect(undoRedoFromKey({ key: "y" }, body)).toBeNull();
    expect(undoRedoFromKey({ key: "y", metaKey: true }, body)).toBeNull();
    expect(undoRedoFromKey({ key: "y", ctrlKey: true, shiftKey: true }, body)).toBeNull();
  });

  it("ignores Alt, auto-repeat, IME composition and already handled events", () => {
    expect(undoRedoFromKey({ key: "z", ctrlKey: true, altKey: true }, body)).toBeNull();
    expect(undoRedoFromKey({ key: "z", ctrlKey: true, repeat: true }, body)).toBeNull();
    expect(undoRedoFromKey({ key: "z", ctrlKey: true, isComposing: true }, body)).toBeNull();
    expect(undoRedoFromKey({ key: "z", ctrlKey: true, defaultPrevented: true }, body)).toBeNull();
  });

  it("ignores text fields (input, textarea, select, contenteditable)", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT", "input"]) {
      expect(undoRedoFromKey({ key: "z", ctrlKey: true }, el(tag)), tag).toBeNull();
    }
    expect(undoRedoFromKey({ key: "z", metaKey: true }, el("DIV", { isContentEditable: true }))).toBeNull();
  });

  it("ignores focus inside a dialog", () => {
    expect(undoRedoFromKey({ key: "z", ctrlKey: true }, el("BUTTON", { closest: () => ({}) }))).toBeNull();
  });

  it("still works with focus on a plain button", () => {
    expect(undoRedoFromKey({ key: "z", ctrlKey: true }, el("BUTTON"))).toBe("undo");
  });
});
