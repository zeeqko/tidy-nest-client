import { useRef, useState } from "react";
import { Check, Plus, X } from "lucide-react";

interface InlineAddProps {
  placeholder: string;
  label: string;
  /** May reject (e.g. duplicate-name 409) — the rejection's message is shown inline. */
  onAdd: (name: string) => Promise<void> | void;
}

/** A pill button that expands into a small inline text input. */
export function InlineAdd({ placeholder, label, onAdd }: InlineAddProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Bumped on every Cancel/Escape so a since-cancelled in-flight submit()
  // (there's no AbortController plumbed through the API layer) can tell it's
  // stale when it eventually settles and ignore the result instead of
  // touching state on an abandoned field.
  const sessionRef = useRef(0);

  const close = () => {
    sessionRef.current += 1;
    setOpen(false);
    setMessage(null);
    setSubmitting(false);
  };

  const submit = async () => {
    if (submitting) return;
    const name = value.trim();
    if (!name) {
      setMessage("Name is required");
      inputRef.current?.focus();
      return;
    }
    const session = sessionRef.current;
    setSubmitting(true);
    try {
      await onAdd(name);
      if (sessionRef.current !== session) return; // cancelled while in flight
      setValue("");
      setMessage(null);
      setOpen(false);
      setSubmitting(false);
    } catch (err) {
      if (sessionRef.current !== session) return; // cancelled while in flight
      setMessage(err instanceof Error ? err.message : "Failed to add");
      inputRef.current?.focus();
      setSubmitting(false);
    }
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
    <span className="flex flex-col items-start gap-1">
      <span className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          autoFocus
          value={value}
          disabled={submitting}
          onChange={(e) => {
            setValue(e.target.value);
            if (message) setMessage(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") close();
          }}
          placeholder={placeholder}
          className="w-36 rounded-full border border-cute-border bg-cute-surface px-3 py-1.5 font-body text-xs text-cute-text outline-none focus:border-cute-primary disabled:opacity-60"
        />
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          aria-label={`Confirm ${label}`}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-cute-primary text-cute-primary-foreground transition hover:brightness-105 disabled:opacity-60"
        >
          <Check size={13} />
        </button>
        <button
          type="button"
          onClick={close}
          aria-label={`Cancel ${label}`}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-cute-surface-alt text-cute-text-muted transition hover:brightness-95"
        >
          <X size={13} />
        </button>
      </span>
      {message && (
        <p
          role="status"
          aria-live="polite"
          className="max-w-[180px] font-body text-[11px] text-cute-danger"
        >
          {message}
        </p>
      )}
    </span>
  );
}
