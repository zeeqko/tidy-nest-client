import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Plus } from "lucide-react";
import { MODAL_Z_CLASS } from "./ModalShell";

export interface OptionPickerOption {
  id: number | string;
  name: string;
}

interface OptionPickerProps {
  /** Every existing option for the current category (unfiltered). */
  options: OptionPickerOption[];
  /** Currently selected option names (at most one unless `multiple`). */
  selected: string[];
  multiple?: boolean;
  placeholder: string;
  /** Noun used in the "Add new …" row, e.g. "subcategory" or "tag". */
  noun: string;
  /** Toggles (multiple) or replaces (single) the given option. */
  onSelect: (name: string) => void;
  /**
   * Reports this dropdown's open state so a parent (e.g. ItemFormModal) can
   * guard its own Escape handling — Escape closes the dropdown first, the
   * parent only on a second press with nothing open.
   */
  onOpenChange?: (open: boolean) => void;
}

interface PanelRect {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

const PANEL_GAP = 6;
const PANEL_PREFERRED_HEIGHT = 320;
const VIEWPORT_MARGIN = 8;

/**
 * Input-styled dropdown that always lists every option for the category and
 * offers an explicit `+ Add "…"` row for names that don't exist yet (same
 * create-on-the-fly model as the category editor's subcategories/tags). The
 * panel is portaled to `document.body` and positioned from the trigger's
 * viewport rect so it's never clipped by a scrollable ancestor (e.g. the
 * modal body).
 */
export function OptionPicker({
  options,
  selected,
  multiple,
  placeholder,
  noun,
  onSelect,
  onOpenChange,
}: OptionPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rect, setRect] = useState<PanelRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Report open state changes to the parent from an effect (not from inside
  // the setState updater above) — calling a different component's setState
  // during this component's render/update phase trips React's "Cannot update
  // a component while rendering a different component" warning.
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  // Position the portaled panel from the trigger's viewport rect, and keep it
  // aligned while the modal body (or the page) scrolls or the window resizes.
  // Flips above the trigger when there isn't enough room below.
  useEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    const updateRect = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const spaceBelow = window.innerHeight - r.bottom - VIEWPORT_MARGIN;
      const spaceAbove = r.top - VIEWPORT_MARGIN;
      if (spaceBelow < 200 && spaceAbove > spaceBelow) {
        setRect({
          left: r.left,
          width: r.width,
          bottom: window.innerHeight - r.top + PANEL_GAP,
          maxHeight: Math.min(PANEL_PREFERRED_HEIGHT, spaceAbove),
        });
      } else {
        setRect({
          left: r.left,
          width: r.width,
          top: r.bottom + PANEL_GAP,
          maxHeight: Math.min(PANEL_PREFERRED_HEIGHT, spaceBelow),
        });
      }
    };
    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [open]);

  // Escape closes only this dropdown. A parent (ItemFormModal) listens for
  // the same key and guards its own close behind `onOpenChange`, so it only
  // reacts on a second, dropdown-free press.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const trimmed = query.trim();
  const shown = trimmed
    ? options.filter((o) => o.name.toLowerCase().includes(trimmed.toLowerCase()))
    : options;
  const exactExists = options.some((o) => o.name.toLowerCase() === trimmed.toLowerCase());

  const pick = (name: string) => {
    onSelect(name);
    setQuery("");
    if (!multiple) setOpen(false);
  };

  return (
    <div className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
        }}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-cute-m border border-cute-border bg-cute-surface px-3.5 py-2.5 font-body text-sm outline-none transition focus:border-cute-primary"
      >
        <span className={`truncate ${selected.length ? "text-cute-text" : "text-cute-text-muted"}`}>
          {selected.length ? selected.join(", ") : placeholder}
        </span>
        <ChevronDown size={15} className="shrink-0 text-cute-text-muted" />
      </button>
      {open &&
        rect &&
        createPortal(
          <>
            {/* Portaled to document.body, so this needs to out-rank every
                modal layer in the shared z-scale (see ModalShell's MODAL_Z)
                — otherwise it paints behind the opaque modal card it was
                opened from. */}
            <div
              className={`fixed inset-0 ${MODAL_Z_CLASS.pickerOverlay}`}
              onPointerDown={() => setOpen(false)}
            />
            <div
              style={{
                position: "fixed",
                left: rect.left,
                width: rect.width,
                maxHeight: rect.maxHeight,
                ...(rect.top !== undefined ? { top: rect.top } : { bottom: rect.bottom }),
              }}
              className={`${MODAL_Z_CLASS.pickerPanel} flex flex-col overflow-y-auto rounded-cute-m border border-cute-border bg-cute-surface p-2 shadow-[0_12px_28px_-6px_rgba(74,63,85,0.19)]`}
            >
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (trimmed)
                    pick(
                      shown[0]?.name.toLowerCase() === trimmed.toLowerCase()
                        ? shown[0].name
                        : trimmed,
                    );
                }}
                placeholder={`Search or add a ${noun}…`}
                autoFocus
                className="mb-1 w-full shrink-0 rounded-full border border-cute-border bg-cute-surface-alt px-3.5 py-2 font-body text-base text-cute-text outline-none transition placeholder:text-cute-text-muted focus:border-cute-primary"
              />
              <div className="flex max-h-44 flex-col overflow-y-auto">
                {shown.map((option) => {
                  const isSelected = selected.includes(option.name);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => pick(option.name)}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left font-body text-sm transition hover:bg-cute-surface-alt ${
                        isSelected ? "font-semibold text-cute-text" : "text-cute-text-muted"
                      }`}
                    >
                      <span className="truncate">{option.name}</span>
                      {isSelected && <Check size={14} className="shrink-0 text-cute-primary" />}
                    </button>
                  );
                })}
                {shown.length === 0 && !trimmed && (
                  <p className="px-3 py-2 font-body text-[13px] text-cute-text-muted">
                    No {noun}s yet — type a name to add one.
                  </p>
                )}
                {trimmed && !exactExists && (
                  <button
                    type="button"
                    onClick={() => pick(trimmed)}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-body text-sm font-semibold text-cute-primary transition hover:bg-cute-surface-alt"
                  >
                    <Plus size={14} className="shrink-0" />
                    Add new {noun} “{trimmed}”
                  </button>
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
