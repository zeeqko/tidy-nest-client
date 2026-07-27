import { useEffect } from "react";
import { ChevronLeft, ChevronRight, Ellipsis, X } from "lucide-react";
import type { OrganizingItem } from "../types";
import { StatCard } from "./StatCard";
import { DetailsList } from "./DetailsList";
import { NotesSection } from "./NotesSection";
import { DetailActions } from "./DetailActions";

/** Mobile stat-bubble colours from the Item Detail (Mobile) design. */
const STAT_ACCENTS = [
  { bg: "#D6ECFF", fg: "#1B4D89" },
  { bg: "#B8EFC0", fg: "#1F5C2A" },
  { bg: "#FFE3C2", fg: "#8A5A1F" },
];

interface ItemDetailModalProps {
  item: OrganizingItem;
  onClose: () => void;
  onEdit?: (item: OrganizingItem) => void;
  onDelete?: (item: OrganizingItem) => void;
}

/** Full-screen detail page on mobile, centered modal on sm+ (per UI.pen). */
export function ItemDetailModal({ item, onClose, onEdit, onDelete }: ItemDetailModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const Icon = item.icon;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-cute-bg pt-[env(safe-area-inset-top)] sm:bg-[#4A3F5555] sm:p-6 sm:pt-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex h-full w-full flex-col bg-cute-bg sm:h-auto sm:max-h-[90vh] sm:max-w-[620px] sm:rounded-cute-l sm:bg-cute-surface sm:shadow-[0_20px_50px_-10px_rgba(74,63,85,0.19)]">
        <div className="flex w-full shrink-0 items-center justify-between gap-3 px-5 pt-5 pb-3 sm:p-5 sm:pb-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Go back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cute-surface-alt text-cute-text transition hover:brightness-95 sm:hidden"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex min-w-0 items-center justify-center gap-1.5 sm:order-2">
            <span className="truncate font-body text-[13px] text-cute-text-muted">
              {item.category.label}
            </span>
            <ChevronRight size={12} className="shrink-0 text-cute-text-muted" />
            <span className="truncate font-body text-[13px] font-semibold text-cute-text">
              {item.subcategory}
            </span>
          </div>
          <div className="flex items-center gap-2 sm:order-1">
            <button
              type="button"
              aria-label="More options"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-cute-surface-alt text-cute-text transition hover:brightness-95 sm:h-[34px] sm:w-[34px]"
            >
              <Ellipsis size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="hidden h-[34px] w-[34px] items-center justify-center rounded-full bg-cute-surface-alt text-cute-text transition hover:brightness-95 sm:flex"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 w-full flex-1 flex-col gap-6 overflow-y-auto px-5 py-4 sm:p-9 sm:pt-6">
          <div className="flex w-full flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:gap-5 sm:text-left">
            {item.imageURL ? (
              <img
                src={item.imageURL}
                alt={item.name}
                className="h-[120px] w-[120px] shrink-0 rounded-cute-l object-cover sm:h-[150px] sm:w-[150px]"
              />
            ) : (
              <div
                className="flex h-[120px] w-[120px] shrink-0 items-center justify-center rounded-cute-l sm:h-[150px] sm:w-[150px]"
                style={{ backgroundColor: item.iconBg }}
              >
                <Icon size={48} color={item.iconColor} />
              </div>
            )}
            <div className="flex flex-col items-center gap-2.5 sm:flex-1 sm:items-start">
              <h2 className="font-heading text-2xl font-semibold text-cute-text sm:text-[28px]">
                {item.name}
              </h2>
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <span
                  className="rounded-full px-3.5 py-1.5 font-body text-xs font-bold sm:px-3 sm:py-[5px] sm:font-semibold"
                  style={{ backgroundColor: item.category.bg, color: item.category.fg }}
                >
                  {item.category.label}
                </span>
                <span className="rounded-full bg-cute-surface-alt px-3.5 py-1.5 font-body text-xs font-semibold text-cute-text sm:px-3 sm:py-[5px]">
                  {item.subcategory}
                </span>
                {item.tags.map((tag) => (
                  <span
                    key={tag.label}
                    className="rounded-full px-3.5 py-1.5 font-body text-xs font-semibold sm:px-3 sm:py-[5px]"
                    style={{ backgroundColor: tag.bg, color: tag.fg }}
                  >
                    {tag.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="grid w-full grid-cols-3 gap-2.5 sm:gap-3.5">
            {item.stats.map((stat, index) => (
              <StatCard
                key={stat.label}
                stat={stat}
                accent={STAT_ACCENTS[index % STAT_ACCENTS.length]}
              />
            ))}
          </div>

          <DetailsList rows={item.details} />
          {item.notes.trim() !== "" && <NotesSection notes={item.notes} />}
          <div className="hidden sm:block">
            <DetailActions onEdit={() => onEdit?.(item)} onDelete={() => onDelete?.(item)} />
          </div>
        </div>

        <div className="w-full shrink-0 border-t border-cute-border bg-cute-surface px-5 pt-3.5 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:hidden">
          <DetailActions onEdit={() => onEdit?.(item)} onDelete={() => onDelete?.(item)} />
        </div>
      </div>
    </div>
  );
}
