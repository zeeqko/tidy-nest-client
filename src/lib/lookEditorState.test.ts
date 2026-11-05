import { describe, expect, it } from "vitest";
import type { PlacedItem } from "../components/OutfitBuilderPage";
import { DESIGN_WIDTH } from "./canvasSpace";
import { editorReducer, initialEditorState, type EditorAction, type EditorState } from "./lookEditorState";

const icon = (() => null) as unknown as PlacedItem["icon"];

function mk(id: string, over: Partial<PlacedItem> = {}): PlacedItem {
  return {
    id,
    itemId: `item-${id}`,
    x: 100,
    y: 100,
    width: 50,
    height: 50,
    rotation: 0,
    zIndex: 1,
    name: id,
    icon,
    iconBg: "#fff",
    iconColor: "#000",
    ...over,
  };
}

describe("editorReducer", () => {
  it("add pushes one undo step", () => {
    const s = editorReducer(initialEditorState(), { type: "add", item: mk("a") });
    expect(s.items).toHaveLength(1);
    expect(s.past).toHaveLength(1);
    expect(s.past[0]).toEqual([]);
  });

  it("undo then redo", () => {
    let s = initialEditorState();
    s = editorReducer(s, { type: "add", item: mk("a") });
    s = editorReducer(s, { type: "add", item: mk("b") });
    s = editorReducer(s, { type: "undo" });
    expect(s.items.map((i) => i.id)).toEqual(["a"]);
    s = editorReducer(s, { type: "redo" });
    expect(s.items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("new action after undo clears future", () => {
    let s = editorReducer(initialEditorState(), { type: "add", item: mk("a") });
    s = editorReducer(s, { type: "undo" });
    expect(s.future).toHaveLength(1);
    s = editorReducer(s, { type: "add", item: mk("b") });
    expect(s.future).toHaveLength(0);
  });

  it("undo/redo with empty stacks return same state", () => {
    const s = initialEditorState();
    expect(editorReducer(s, { type: "undo" })).toBe(s);
    expect(editorReducer(s, { type: "redo" })).toBe(s);
  });

  it("same itemId twice yields two placements; undo removes last only", () => {
    let s = initialEditorState();
    s = editorReducer(s, { type: "add", item: mk("a", { itemId: "x" }) });
    s = editorReducer(s, { type: "add", item: mk("b", { itemId: "x" }) });
    expect(s.items).toHaveLength(2);
    s = editorReducer(s, { type: "undo" });
    expect(s.items.map((i) => i.id)).toEqual(["a"]);
  });

  it("copy creates offset placement of same itemId, on top, selected", () => {
    let s = initialEditorState([mk("a", { zIndex: 3 })]);
    s = editorReducer(s, { type: "copy", id: "a", newId: "a2" });
    const c = s.items.find((i) => i.id === "a2")!;
    expect(c.itemId).toBe("item-a");
    expect(c.x).toBe(116);
    expect(c.y).toBe(116);
    expect(c.zIndex).toBe(4);
    expect(s.selectedId).toBe("a2");
    expect(s.past).toHaveLength(1);
  });

  it("copy of unknown id is a no-op", () => {
    const s = initialEditorState([mk("a")]);
    expect(editorReducer(s, { type: "copy", id: "zz", newId: "n" })).toBe(s);
  });

  it("remove clears selectedId when it was selected, keeps otherwise", () => {
    let s = initialEditorState([mk("a"), mk("b")]);
    s = editorReducer(s, { type: "select", id: "a" });
    const kept = editorReducer(s, { type: "remove", id: "b" });
    expect(kept.selectedId).toBe("a");
    const cleared = editorReducer(s, { type: "remove", id: "a" });
    expect(cleared.selectedId).toBeNull();
  });

  it("undo after remove restores the item", () => {
    let s = initialEditorState([mk("a")]);
    s = editorReducer(s, { type: "remove", id: "a" });
    expect(s.items).toHaveLength(0);
    s = editorReducer(s, { type: "undo" });
    expect(s.items.map((i) => i.id)).toEqual(["a"]);
  });

  it("update is clamped into the space", () => {
    let s = initialEditorState([mk("a")]);
    s = editorReducer(s, { type: "update", id: "a", patch: { x: 9999 } });
    expect(s.items[0].x).toBe(DESIGN_WIDTH - 50);
    expect(s.past).toHaveLength(1);
  });

  it("update that changes nothing returns the same state and pushes no history", () => {
    const s = editorReducer(initialEditorState([mk("a", { rotation: 15 })]), { type: "select", id: "a" });
    const same = editorReducer(s, {
      type: "update",
      id: "a",
      patch: { x: 100, y: 100, width: 50, height: 50, rotation: 15 },
    });
    expect(same).toBe(s);
    expect(same.past).toHaveLength(0);
    expect(editorReducer(s, { type: "update", id: "a", patch: {} })).toBe(s);
  });

  it("update clamped back onto the current position is a no-op", () => {
    const s = initialEditorState([mk("a", { x: DESIGN_WIDTH - 50 })]);
    expect(editorReducer(s, { type: "update", id: "a", patch: { x: 9999 } })).toBe(s);
  });

  it("a real change to any single transform field still commits", () => {
    const s = initialEditorState([mk("a")]);
    for (const patch of [{ x: 101 }, { y: 99 }, { width: 51 }, { height: 49 }, { rotation: 1 }]) {
      const n = editorReducer(s, { type: "update", id: "a", patch });
      expect(n, JSON.stringify(patch)).not.toBe(s);
      expect(n.past).toHaveLength(1);
      expect(n.items[0]).toMatchObject(patch);
    }
  });

  it("update of unknown id is a no-op", () => {
    const s = initialEditorState([mk("a")]);
    expect(editorReducer(s, { type: "update", id: "zz", patch: { x: 1 } })).toBe(s);
  });

  it("reorder front/back use max+1 / min-1", () => {
    const s0 = initialEditorState([mk("a", { zIndex: 1 }), mk("b", { zIndex: 5 })]);
    const f = editorReducer(s0, { type: "reorder", id: "a", direction: "front" });
    expect(f.items.find((i) => i.id === "a")!.zIndex).toBe(6);
    const b = editorReducer(s0, { type: "reorder", id: "b", direction: "back" });
    expect(b.items.find((i) => i.id === "b")!.zIndex).toBe(0);
    expect(b.past).toHaveLength(1);
  });

  it("select does not touch history", () => {
    const s = initialEditorState([mk("a")]);
    const n = editorReducer(s, { type: "select", id: "a" });
    expect(n.selectedId).toBe("a");
    expect(n.past).toBe(s.past);
    expect(n.future).toBe(s.future);
  });

  it("load replaces items and resets history and selection", () => {
    let s = editorReducer(initialEditorState(), { type: "add", item: mk("a") });
    s = editorReducer(s, { type: "select", id: "a" });
    s = editorReducer(s, { type: "load", items: [mk("z")] });
    expect(s.items.map((i) => i.id)).toEqual(["z"]);
    expect(s.past).toEqual([]);
    expect(s.future).toEqual([]);
    expect(s.selectedId).toBeNull();
  });

  it("caps history at 100", () => {
    let s = initialEditorState();
    for (let i = 0; i < 105; i++) s = editorReducer(s, { type: "add", item: mk(`i${i}`) });
    expect(s.past).toHaveLength(100);
    expect(s.items).toHaveLength(105);
  });

  it("never mutates input state", () => {
    const base = initialEditorState([mk("a"), mk("b")]);
    const frozen: EditorState = Object.freeze({
      ...base,
      items: Object.freeze(base.items.map((i) => Object.freeze({ ...i }))) as PlacedItem[],
      past: Object.freeze([]) as unknown as PlacedItem[][],
      future: Object.freeze([]) as unknown as PlacedItem[][],
    });
    const actions: EditorAction[] = [
      { type: "add", item: mk("c") },
      { type: "update", id: "a", patch: { x: 5 } },
      { type: "reorder", id: "a", direction: "front" },
      { type: "copy", id: "a", newId: "n" },
      { type: "remove", id: "a" },
      { type: "select", id: "a" },
      { type: "load", items: [] },
      { type: "cutout", itemId: "item-a", cutoutURL: "/cut-a.png" },
      { type: "undo" },
      { type: "redo" },
    ];
    for (const a of actions) expect(() => editorReducer(frozen, a)).not.toThrow();
  });

  describe("cutout", () => {
    const cut = (itemId: string, cutoutURL = "/cut.png"): EditorAction => ({ type: "cutout", itemId, cutoutURL });

    it("swaps every placement of the item (duplicates too) in place, leaving other items untouched", () => {
      const a1 = mk("a1", { itemId: "x", imageURL: "/photo.jpg", x: 10, rotation: 30, zIndex: 4 });
      const a2 = mk("a2", { itemId: "x", imageURL: "/photo.jpg", y: 300 });
      const b = mk("b", { itemId: "y", imageURL: "/b.jpg" });
      const s = editorReducer(initialEditorState([a1, b, a2]), { type: "select", id: "b" });
      const n = editorReducer(s, cut("x"));
      expect(n.items.map((i) => i.cutoutURL)).toEqual(["/cut.png", undefined, "/cut.png"]);
      expect(n.items[0]).toEqual({ ...a1, cutoutURL: "/cut.png" });
      expect(n.items[2]).toEqual({ ...a2, cutoutURL: "/cut.png" });
      expect(n.items[1]).toBe(b);
      expect(n.selectedId).toBe("b");
    });

    it("pushes no history and keeps the redo stack", () => {
      let s = initialEditorState();
      s = editorReducer(s, { type: "add", item: mk("a", { itemId: "x" }) });
      s = editorReducer(s, { type: "add", item: mk("b", { itemId: "y" }) });
      s = editorReducer(s, { type: "undo" });
      const n = editorReducer(s, cut("x"));
      expect(n.past).toHaveLength(s.past.length);
      expect(n.future).toHaveLength(1);
      expect(n.future[0].map((i) => i.id)).toEqual(["a", "b"]);
    });

    it("patches past and future snapshots so undo and redo keep the cutout", () => {
      let s = initialEditorState();
      s = editorReducer(s, { type: "add", item: mk("a", { itemId: "x" }) });
      s = editorReducer(s, { type: "update", id: "a", patch: { x: 150 } });
      s = editorReducer(s, { type: "update", id: "a", patch: { x: 200 } });
      s = editorReducer(s, { type: "undo" }); // a at 150, future has a at 200
      s = editorReducer(s, cut("x"));
      expect(s.items[0].cutoutURL).toBe("/cut.png");
      expect(s.past.flat().every((i) => i.cutoutURL === "/cut.png")).toBe(true);
      expect(s.future.flat().every((i) => i.cutoutURL === "/cut.png")).toBe(true);

      const undone = editorReducer(s, { type: "undo" });
      expect(undone.items[0]).toMatchObject({ x: 100, cutoutURL: "/cut.png" });
      const redone = editorReducer(editorReducer(s, { type: "redo" }), { type: "undo" });
      expect(redone.items[0]).toMatchObject({ x: 150, cutoutURL: "/cut.png" });
      expect(editorReducer(s, { type: "redo" }).items[0]).toMatchObject({ x: 200, cutoutURL: "/cut.png" });
    });

    it("patches a placement that only exists in history (removed, then restored by undo)", () => {
      let s = initialEditorState([mk("a", { itemId: "x" })]);
      s = editorReducer(s, { type: "remove", id: "a" });
      s = editorReducer(s, cut("x"));
      expect(s.items).toHaveLength(0);
      s = editorReducer(s, { type: "undo" });
      expect(s.items[0].cutoutURL).toBe("/cut.png");
    });

    it("returns the same state for an unknown itemId", () => {
      let s = editorReducer(initialEditorState(), { type: "add", item: mk("a") });
      s = editorReducer(s, { type: "undo" });
      expect(editorReducer(s, cut("nope"))).toBe(s);
    });

    it("is idempotent once the URL is set", () => {
      const s = editorReducer(
        editorReducer(initialEditorState(), { type: "add", item: mk("a", { itemId: "x" }) }),
        cut("x"),
      );
      expect(editorReducer(s, cut("x"))).toBe(s);
      // A different URL still swaps.
      expect(editorReducer(s, cut("x", "/other.png")).items[0].cutoutURL).toBe("/other.png");
    });

    it("does not mutate frozen input state (items and snapshots)", () => {
      const snap = Object.freeze([Object.freeze(mk("a", { itemId: "x", x: 5 }))]) as PlacedItem[];
      const frozen: EditorState = Object.freeze({
        items: Object.freeze([Object.freeze(mk("a", { itemId: "x" }))]) as PlacedItem[],
        selectedId: null,
        past: Object.freeze([snap]) as unknown as PlacedItem[][],
        future: Object.freeze([snap]) as unknown as PlacedItem[][],
      });
      const n = editorReducer(frozen, cut("x"));
      expect(n).not.toBe(frozen);
      expect(frozen.items[0].cutoutURL).toBeUndefined();
      expect(snap[0].cutoutURL).toBeUndefined();
      expect(n.past[0][0].cutoutURL).toBe("/cut.png");
    });
  });
});
