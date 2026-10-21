import type { AggregatedTag } from "../lib/aggregateTags";

interface TagFiltersProps {
  tags: AggregatedTag[];
  /** "all" or a tag label. */
  active: string;
  onSelect: (value: string) => void;
}

export function TagFilters({ tags, active, onSelect }: TagFiltersProps) {
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onSelect("all")}
        className={`rounded-full px-4 py-[7px] font-body text-xs font-semibold transition ${
          active === "all"
            ? "bg-cute-secondary text-cute-secondary-foreground"
            : "border border-cute-border bg-cute-surface text-cute-text hover:bg-cute-surface-alt"
        }`}
      >
        All Tags
      </button>
      {tags.map((tag) => (
        <button
          key={tag.label}
          type="button"
          onClick={() => onSelect(tag.label)}
          className={`flex items-center gap-1.5 rounded-full border px-3.5 py-[7px] font-body text-xs transition ${
            active === tag.label
              ? "border-cute-text bg-cute-surface-alt font-semibold text-cute-text"
              : "border-cute-border bg-cute-surface text-cute-text hover:bg-cute-surface-alt"
          }`}
        >
          <span
            className="h-[7px] w-[7px] rounded-full"
            style={{ backgroundColor: tag.bg, border: `1px solid ${tag.fg}` }}
          />
          {tag.label} ({tag.count})
        </button>
      ))}
    </div>
  );
}
