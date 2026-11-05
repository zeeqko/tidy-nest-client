import { describe, expect, it } from "vitest";
import { shouldDeleteOnKey, type ActiveElementLike } from "./canvasKeyboard";

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
