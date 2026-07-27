import { useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";

interface OptionPickerProps {
  /** Every existing option for the current category (unfiltered). */
  options: string[];
  /** Currently selected option names (at most one unless `multiple`). */
  selected: string[];
  multiple?: boolean;
  placeholder: string;
  /** Noun used in the "Add new …" row, e.g. "subcategory" or "tag". */
  noun: string;
  /** Toggles (multiple) or replaces (single) the given option. */
  onSelect: (name: string) => void;
}

/**
 * Input-styled dropdown that always lists every option for the category and
 * offers an explicit `+ Add "…"` row for names that don't exist yet (same
 * create-on-the-fly model as the category editor's subcategories/tags).
 */
export function OptionPicker({
  options,
  selected,
  multiple,
  placeholder,
  noun,
  onSelect,
}: OptionPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const trimmed = query.trim();
  const shown = trimmed
    ? options.filter((o) => o.toLowerCase().includes(trimmed.toLowerCase()))
    : options;
  const exactExists = options.some((o) => o.toLowerCase() === trimmed.toLowerCase());

  const pick = (name: string) => {
    onSelect(name);
    setQuery("");
    if (!multiple) setOpen(false);
  };

  return (
    <div className="relative w-full">
      <button
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
      {open && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(false)} />
          <div className="absolute top-full right-0 left-0 z-50 mt-1.5 flex flex-col rounded-cute-m border border-cute-border bg-cute-surface p-2 shadow-[0_12px_28px_-6px_rgba(74,63,85,0.19)]">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (trimmed) pick(shown[0]?.toLowerCase() === trimmed.toLowerCase() ? shown[0] : trimmed);
              }}
              placeholder={`Search or add a ${noun}…`}
              autoFocus
              className="mb-1 w-full rounded-full border border-cute-border bg-cute-surface-alt px-3.5 py-2 font-body text-[13px] text-cute-text outline-none transition placeholder:text-cute-text-muted focus:border-cute-primary"
            />
            <div className="flex max-h-44 flex-col overflow-y-auto">
              {shown.map((option) => {
                const isSelected = selected.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => pick(option)}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left font-body text-sm transition hover:bg-cute-surface-alt ${
                      isSelected ? "font-semibold text-cute-text" : "text-cute-text-muted"
                    }`}
                  >
                    <span className="truncate">{option}</span>
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
        </>
      )}
    </div>
  );
}
