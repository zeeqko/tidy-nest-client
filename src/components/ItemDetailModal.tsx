import { ChevronRight, Ellipsis } from "lucide-react";
import type { OrganizingItem } from "../types";
import { StatCard } from "./StatCard";
import { DetailsList } from "./DetailsList";
import { NotesSection } from "./NotesSection";
import { DetailActions } from "./DetailActions";
import { ModalShell } from "./ModalShell";

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
  const Icon = item.icon;

  return (
    <ModalShell
      level="raised"
      onClose={onClose}
      maxWidthClassName="sm:max-w-[620px]"
      bodyClassName="gap-6 px-5 py-4 sm:p-9 sm:pt-6"
      titleAs="div"
      titleClassName="flex min-w-0 items-center gap-1.5"
      title={
        <>
          <span className="truncate font-body text-[13px] text-cute-text-muted">
            {item.category.label}
          </span>
          <ChevronRight size={12} className="shrink-0 text-cute-text-muted" />
          <span className="truncate font-body text-[13px] font-semibold text-cute-text">
            {item.subcategory}
          </span>
        </>
      }
      headerRight={
        <button
          type="button"
          aria-label="More options"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-cute-surface-alt text-cute-text transition hover:brightness-95"
        >
          <Ellipsis size={16} />
        </button>
      }
      footer={<DetailActions onEdit={() => onEdit?.(item)} onDelete={() => onDelete?.(item)} />}
      footerClassName="w-full shrink-0 border-t border-cute-border bg-cute-surface px-5 pt-3.5 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:hidden"
    >
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
          <StatCard key={stat.label} stat={stat} accent={STAT_ACCENTS[index % STAT_ACCENTS.length]} />
        ))}
      </div>

      <DetailsList rows={item.details} />
      {item.notes.trim() !== "" && <NotesSection notes={item.notes} />}
      <div className="hidden sm:block">
        <DetailActions onEdit={() => onEdit?.(item)} onDelete={() => onDelete?.(item)} />
      </div>
    </ModalShell>
  );
}
