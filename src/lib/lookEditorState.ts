import type { PlacedItem } from "../components/OutfitBuilderPage";
import { clampItem } from "./canvasSpace";

export interface EditorState {
  items: PlacedItem[];
  selectedId: string | null;
  past: PlacedItem[][];
  future: PlacedItem[][];
}

export type EditorAction =
  | { type: "add"; item: PlacedItem }
  | {
      type: "update";
      id: string;
      patch: Partial<Pick<PlacedItem, "x" | "y" | "width" | "height" | "rotation">>;
    }
  | { type: "reorder"; id: string; direction: "front" | "back" }
  | { type: "copy"; id: string; newId: string }
  | { type: "remove"; id: string }
  | { type: "select"; id: string | null }
  | { type: "load"; items: PlacedItem[] }
  /** A background-removed cutout became ready for inventory item `itemId`:
   *  every placement of it switches to that image in place (same box), in the
   *  live items and in every undo/redo snapshot. Not an edit: no history. */
  | { type: "cutout"; itemId: string; cutoutURL: string }
  | { type: "undo" }
  | { type: "redo" };

const HISTORY_LIMIT = 100;
const COPY_OFFSET = 16;
const TRANSFORM_KEYS = ["x", "y", "width", "height", "rotation"] as const;

export function initialEditorState(items: PlacedItem[] = []): EditorState {
  return { items, selectedId: null, past: [], future: [] };
}

/** Commit a new items list, recording the previous one for undo. */
function commit(state: EditorState, items: PlacedItem[], selectedId = state.selectedId): EditorState {
  const past = [...state.past, state.items];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { items, selectedId, past, future: [] };
}

/** `items` with `cutoutURL` set on every placement of `itemId`, or the same
 *  array when none of them needs it (no match, or already set). */
function withCutout(items: PlacedItem[], itemId: string, cutoutURL: string): PlacedItem[] {
  if (!items.some((i) => i.itemId === itemId && i.cutoutURL !== cutoutURL)) return items;
  return items.map((i) => (i.itemId === itemId && i.cutoutURL !== cutoutURL ? { ...i, cutoutURL } : i));
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "add":
      return commit(state, [...state.items, action.item]);

    case "update": {
      const current = state.items.find((i) => i.id === action.id);
      if (!current) return state;
      const next = clampItem({ ...current, ...action.patch });
      // A tap or a drag that ends where it started is not an edit: keep the
      // same state (no undo step).
      if (TRANSFORM_KEYS.every((key) => next[key] === current[key])) return state;
      return commit(
        state,
        state.items.map((i) => (i.id === action.id ? next : i)),
      );
    }

    case "reorder": {
      if (!state.items.some((i) => i.id === action.id)) return state;
      const zs = state.items.map((i) => i.zIndex);
      const zIndex = action.direction === "front" ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
      return commit(
        state,
        state.items.map((i) => (i.id === action.id ? { ...i, zIndex } : i)),
      );
    }

    case "copy": {
      const src = state.items.find((i) => i.id === action.id);
      if (!src) return state;
      const copy = clampItem({
        ...src,
        id: action.newId,
        x: src.x + COPY_OFFSET,
        y: src.y + COPY_OFFSET,
        zIndex: Math.max(...state.items.map((i) => i.zIndex)) + 1,
      });
      return commit(state, [...state.items, copy], action.newId);
    }

    case "remove": {
      if (!state.items.some((i) => i.id === action.id)) return state;
      return commit(
        state,
        state.items.filter((i) => i.id !== action.id),
        state.selectedId === action.id ? null : state.selectedId,
      );
    }

    case "select":
      return state.selectedId === action.id ? state : { ...state, selectedId: action.id };

    case "load":
      return initialEditorState(action.items);

    case "cutout": {
      const { itemId, cutoutURL } = action;
      const items = withCutout(state.items, itemId, cutoutURL);
      // Snapshots are patched too, so Undo/Redo never bring the photo back.
      const patch = (stack: PlacedItem[][]) => {
        const next = stack.map((snapshot) => withCutout(snapshot, itemId, cutoutURL));
        return next.every((snapshot, i) => snapshot === stack[i]) ? stack : next;
      };
      const past = patch(state.past);
      const future = patch(state.future);
      if (items === state.items && past === state.past && future === state.future) return state;
      return { ...state, items, past, future };
    }

    case "undo": {
      if (state.past.length === 0) return state;
      const items = state.past[state.past.length - 1];
      return {
        items,
        selectedId: items.some((i) => i.id === state.selectedId) ? state.selectedId : null,
        past: state.past.slice(0, -1),
        future: [state.items, ...state.future],
      };
    }

    case "redo": {
      if (state.future.length === 0) return state;
      const [items, ...future] = state.future;
      return {
        items,
        selectedId: items.some((i) => i.id === state.selectedId) ? state.selectedId : null,
        past: [...state.past, state.items],
        future,
      };
    }
  }
}
