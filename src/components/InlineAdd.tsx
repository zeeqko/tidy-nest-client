import { useState } from "react";
import { Check, Plus, X } from "lucide-react";

interface InlineAddProps {
  placeholder: string;
  label: string;
  onAdd: (name: string) => Promise<void> | void;
}

/** A pill button that expands into a small inline text input. */
export function InlineAdd({ placeholder, label, onAdd }: InlineAddProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  const submit = async () => {
    const name = value.trim();
    if (!name) return;
    await onAdd(name);
    setValue("");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full bg-cute-primary py-1.5 pr-3.5 pl-2.5 font-body text-xs font-semibold text-cute-primary-foreground transition hover:brightness-105"
      >
        <Plus size={12} />
        {label}
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        className="w-36 rounded-full border border-cute-border bg-cute-surface px-3 py-1.5 font-body text-xs text-cute-text outline-none focus:border-cute-primary"
      />
      <button
        type="button"
        onClick={submit}
        aria-label={`Confirm ${label}`}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-cute-primary text-cute-primary-foreground transition hover:brightness-105"
      >
        <Check size={13} />
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label={`Cancel ${label}`}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-cute-surface-alt text-cute-text-muted transition hover:brightness-95"
      >
        <X size={13} />
      </button>
    </span>
  );
}
