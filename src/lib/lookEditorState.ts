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
