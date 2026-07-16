import { Search } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChange,
  placeholder = "Search all your stuff...",
}: SearchBarProps) {
  return (
    <div className="flex w-full items-center gap-2.5 rounded-full border border-cute-border bg-cute-surface-alt px-5 py-3.5">
      <Search size={18} className="shrink-0 text-cute-text-muted" />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent font-body text-sm text-cute-text placeholder:text-cute-text-muted focus:outline-none"
      />
    </div>
  );
}
