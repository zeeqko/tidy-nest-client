import { useReducer, type Dispatch } from "react";
import type { PlacedItem } from "../components/OutfitBuilderPage";
import {
  editorReducer,
  initialEditorState,
  type EditorAction,
  type EditorState,
} from "../lib/lookEditorState";

export function useLookEditor(initial?: PlacedItem[]): {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  canUndo: boolean;
  canRedo: boolean;
} {
  const [state, dispatch] = useReducer(editorReducer, initial, initialEditorState);
  return { state, dispatch, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
