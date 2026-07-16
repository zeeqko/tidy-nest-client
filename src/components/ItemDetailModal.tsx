import { useEffect } from "react";
import { ChevronRight, Ellipsis, X } from "lucide-react";
import type { OrganizingItem } from "../types";
import { StatCard } from "./StatCard";
import { DetailsList } from "./DetailsList";
import { NotesSection } from "./NotesSection";
import { DetailActions } from "./DetailActions";

interface ItemDetailModalProps {
  item: OrganizingItem;
  onClose: () => void;
  onEdit?: (item: OrganizingItem) => void;
  onDelete?: (item: OrganizingItem) => void;
}

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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#4A3F5555] p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-[620px] flex-col gap-6 overflow-y-auto rounded-cute-l bg-cute-surface p-9 shadow-[0_20px_50px_-10px_rgba(74,63,85,0.19)]">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-body text-[13px] text-cute-text-muted">
              {item.category.label}
            </span>
            <ChevronRight size={12} className="text-cute-text-muted" />
            <span className="font-body text-[13px] font-semibold text-cute-text">
              {item.subcategory}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="More options"
              className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-cute-surface-alt text-cute-text transition hover:brightness-95"
            >
              <Ellipsis size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-cute-surface-alt text-cute-text transition hover:brightness-95"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex w-full items-center gap-5">
          <div
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-cute-l"
            style={{ backgroundColor: item.iconBg }}
          >
            <Icon size={44} color={item.iconColor} />
          </div>
          <div className="flex flex-1 flex-col gap-2.5">
            <h2 className="font-heading text-[28px] font-semibold text-cute-text">
              {item.name}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-full px-3 py-[5px] font-body text-xs font-semibold"
                style={{ backgroundColor: item.category.bg, color: item.category.fg }}
              >
                {item.category.label}
              </span>
              <span className="rounded-full bg-cute-surface-alt px-3 py-[5px] font-body text-xs font-semibold text-cute-text">
                {item.subcategory}
              </span>
              {item.tag && (
                <span
                  className="rounded-full px-3 py-[5px] font-body text-xs font-semibold"
                  style={{ backgroundColor: item.tag.bg, color: item.tag.fg }}
                >
                  {item.tag.label}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid w-full grid-cols-3 gap-3.5">
          {item.stats.map((stat) => (
            <StatCard key={stat.label} stat={stat} />
          ))}
        </div>

        <DetailsList rows={item.details} />
        <NotesSection notes={item.notes} />
        <DetailActions onEdit={() => onEdit?.(item)} onDelete={() => onDelete?.(item)} />
      </div>
    </div>
  );
}
