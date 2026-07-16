import { useEffect, useMemo, useState } from "react";
import { X, Pencil, Trash2, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { getCategoryStats } from "../data/categoryStats";
import { useItems } from "../hooks/useItems";

interface ManageCategoriesModalProps {
  onClose: () => void;
}

export function ManageCategoriesModal({ onClose }: ManageCategoriesModalProps) {
  const { items } = useItems();
  const categoryStats = useMemo(() => getCategoryStats(items), [items]);
  const [expandedId, setExpandedId] = useState<string | null>(categoryStats[0]?.id ?? null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#4A3F5555] p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-[780px] flex-col gap-5 overflow-y-auto rounded-cute-l bg-cute-surface p-8 shadow-[0_16px_40px_-8px_rgba(74,63,85,0.19)]">
        <div className="flex w-full items-start justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-[22px] font-semibold text-cute-text">
              Manage Categories
            </h2>
            <p className="font-body text-[13px] text-cute-text-muted">
              Organize your items by type, not just location
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-cute-surface-alt text-cute-text-muted transition hover:brightness-95"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex w-full flex-col gap-3">
          {categoryStats.map((category) => {
            const isExpanded = category.id === expandedId;
            return (
              <div
                key={category.id}
                className={`flex w-full flex-col rounded-cute-m ${
                  isExpanded ? "bg-cute-surface-alt p-3.5" : ""
                }`}
              >
                <div className={`flex w-full items-center gap-3 ${isExpanded ? "" : "p-2.5"}`}>
                  {category.iconSrc && (
                    <img
                      src={category.iconSrc}
                      alt=""
                      className="h-[46px] w-[46px] shrink-0 rounded-full object-cover"
                    />
                  )}
                  <div className="flex flex-1 flex-col gap-px">
                    <p className="font-heading text-[15px] font-medium text-cute-text">
                      {category.label}
                    </p>
                    <p className="font-body text-xs text-cute-text-muted">
                      {category.itemCount} {category.itemCount === 1 ? "item" : "items"}
                      {category.locations.length > 0 && ` (${category.locations.join(" + ")})`}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      aria-label={`Edit ${category.label}`}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-cute-text-muted transition hover:bg-cute-surface"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${category.label}`}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-cute-text-muted transition hover:bg-cute-surface hover:text-cute-danger"
                    >
                      <Trash2 size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label={isExpanded ? `Collapse ${category.label}` : `Expand ${category.label}`}
                      onClick={() => setExpandedId(isExpanded ? null : category.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-cute-text-muted transition hover:bg-cute-surface"
                    >
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <>
                    <div className="flex flex-wrap items-center gap-2 pt-3 pl-[52px]">
                      {category.subcategories.map((sub) => (
                        <span
                          key={sub}
                          className="flex items-center gap-1.5 rounded-full border border-cute-border bg-cute-surface py-1.5 pr-2.5 pl-3.5 font-body text-xs text-cute-text"
                        >
                          {sub}
                          <button
                            type="button"
                            aria-label={`Remove ${sub}`}
                            className="text-cute-text-muted transition hover:text-cute-danger"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                      <button
                        type="button"
                        className="flex items-center gap-1.5 rounded-full bg-cute-primary py-1.5 pr-3.5 pl-2.5 font-body text-xs font-semibold text-cute-primary-foreground transition hover:brightness-105"
                      >
                        <Plus size={12} />
                        Add Subcategory
                      </button>
                    </div>

                    <div className="flex flex-col gap-2 pt-2.5 pl-[52px]">
                      <p className="font-body text-xs font-semibold text-cute-text-muted">Tags</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {category.tags.map((tag) => (
                          <span
                            key={tag.label}
                            className="flex items-center gap-1.5 rounded-full py-1.5 pr-2.5 pl-3.5 font-body text-xs"
                            style={{ backgroundColor: tag.bg, color: tag.fg }}
                          >
                            {tag.label}
                            <button
                              type="button"
                              aria-label={`Remove ${tag.label} tag`}
                              className="transition hover:opacity-70"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                        <button
                          type="button"
                          className="flex items-center gap-1.5 rounded-full bg-cute-primary py-1.5 pr-3.5 pl-2.5 font-body text-xs font-semibold text-cute-primary-foreground transition hover:brightness-105"
                        >
                          <Plus size={12} />
                          Add Tag
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-cute-m border-[1.5px] border-cute-border p-3.5 font-body text-sm font-semibold text-cute-text transition hover:bg-cute-surface-alt"
        >
          <Plus size={16} />
          Add Category
        </button>
      </div>
    </div>
  );
}
