import { ChevronRight } from "lucide-react";
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
  onEdit: (item: OrganizingItem) => void;
  onDelete: (item: OrganizingItem) => void;
}

/** Full-screen detail page on mobile, centered modal on sm+ (per UI.pen). */
export function ItemDetailModal({ item, onClose, onEdit, onDelete }: ItemDetailModalProps) {
  const Icon = item.icon;

  return (
    <ModalShell
      level="raised"
      onClose={onClose}
      maxWidthClassName="sm:max-w-[38.75rem]"
      bodyClassName="gap-6 px-5 py-4 sm:p-9 sm:pt-6 sm:[mask-image:linear-gradient(to_bottom,black_calc(100%-1.5rem),transparent)]"
      bodyLabel="Item details"
      titleAs="div"
      titleClassName="flex min-w-0 items-center gap-1.5"
      title={
        <>
          <span className="truncate font-body text-cute-13 text-cute-text-muted">
            {item.category.label}
          </span>
          <ChevronRight size={12} className="shrink-0 text-cute-text-muted" />
          <span className="truncate font-body text-cute-13 font-semibold text-cute-text">
            {item.subcategory}
          </span>
        </>
      }
      footer={<DetailActions onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} />}
    >
      <div className="flex w-full flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:gap-5 sm:text-left">
        {item.imageURL ? (
          <img
            src={item.imageURL}
            alt={item.name}
            className="h-[7.5rem] w-[7.5rem] shrink-0 rounded-cute-l object-cover sm:h-[9.375rem] sm:w-[9.375rem]"
          />
        ) : (
          <div
            className="flex h-[7.5rem] w-[7.5rem] shrink-0 items-center justify-center rounded-cute-l sm:h-[9.375rem] sm:w-[9.375rem]"
            style={{ backgroundColor: item.iconBg }}
          >
            <Icon size={48} color={item.iconColor} />
          </div>
        )}
        <div className="flex min-w-0 max-w-full flex-col items-center gap-2.5 sm:flex-1 sm:items-start">
          <h2 className="max-w-full font-heading [overflow-wrap:anywhere] text-2xl font-semibold text-cute-text sm:text-cute-28">
            {item.name}
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <span
              className="rounded-full px-3.5 py-1.5 font-body text-xs font-bold sm:px-3 sm:py-[0.3125rem] sm:font-semibold"
              style={{ backgroundColor: item.category.bg, color: item.category.fg }}
            >
              {item.category.label}
            </span>
            <span className="rounded-full bg-cute-surface-alt px-3.5 py-1.5 font-body text-xs font-semibold text-cute-text sm:px-3 sm:py-[0.3125rem]">
              {item.subcategory}
            </span>
            {item.tags.map((tag) => (
              <span
                key={tag.label}
                className="max-w-full rounded-full px-3.5 py-1.5 font-body text-xs font-semibold [overflow-wrap:anywhere] sm:px-3 sm:py-[0.3125rem]"
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
    </ModalShell>
  );
}
