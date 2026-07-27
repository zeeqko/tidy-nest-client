import { useEffect, useRef, useState } from "react";
import { X, Pencil, Trash2, Plus, ChevronDown, ChevronLeft, ChevronUp } from "lucide-react";
import {
  attachTag,
  deleteCategory,
  deleteSubCategory,
  detachTag,
  createSubCategory,
  type ApiCategory,
} from "../api/categories";
import { toUiCategory } from "../data/categories";
import { useCategories } from "../hooks/useCategories";
import type { RefreshScope } from "../types";
import { CategoryBadge } from "./CategoryBadge";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { EditCategoryModal } from "./EditCategoryModal";
import { InlineAdd } from "./InlineAdd";

interface ManageCategoriesModalProps {
  /** Receives what changed while the modal was open, for selective refresh. */
  onClose: (changes: RefreshScope) => void;
}

interface PendingDelete {
  title: string;
  message: string;
  action: () => Promise<unknown>;
  /** Whether the deletion changes what items display (category/subcategory). */
  affectsItems?: boolean;
}

export function ManageCategoriesModal({ onClose }: ManageCategoriesModalProps) {
  const { apiCategories, refresh } = useCategories();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingCategory, setEditingCategory] = useState<ApiCategory | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [error, setError] = useState<string | null>(null);
  const changes = useRef<RefreshScope>({ categories: false, items: false });

  const editorOpen = editingCategory !== null || addingCategory;
  const close = () => onClose(changes.current);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pendingDelete && !editorOpen) onClose(changes.current);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, pendingDelete, editorOpen]);

  const run = async (action: () => Promise<unknown>, affectsItems = false) => {
    try {
      setError(null);
      await action();
      changes.current.categories = true;
      if (affectsItems) changes.current.items = true;
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-cute-bg pt-[env(safe-area-inset-top)] sm:bg-[#4A3F5555] sm:p-6 sm:pt-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="flex h-full w-full flex-col bg-cute-bg sm:h-auto sm:max-h-[90vh] sm:max-w-[780px] sm:rounded-cute-l sm:bg-cute-surface sm:shadow-[0_16px_40px_-8px_rgba(74,63,85,0.19)]">
        <div className="flex w-full items-center gap-3.5 px-5 pt-5 pb-3 sm:items-start sm:justify-between sm:p-8 sm:pb-0">
          <button
            type="button"
            onClick={close}
            aria-label="Go back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cute-surface-alt text-cute-text transition hover:brightness-95 sm:hidden"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex min-w-0 flex-1 flex-col sm:gap-1">
            <h2 className="truncate font-heading text-xl font-semibold text-cute-text sm:text-[22px]">
              Manage Categories
            </h2>
            <p className="hidden font-body text-[13px] text-cute-text-muted sm:block">
              Organize your items by type, not just location
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="hidden h-9 w-9 items-center justify-center rounded-full bg-cute-surface-alt text-cute-text-muted transition hover:brightness-95 sm:flex"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex w-full flex-1 flex-col gap-5 overflow-y-auto px-5 py-4 sm:flex-none sm:p-8 sm:pt-5">
        {error && <p className="font-body text-sm text-cute-danger">{error}</p>}

        <div className="flex w-full flex-col gap-3">
          {apiCategories.map((category) => {
            const isExpanded = category.id === expandedId;
            const ui = toUiCategory(category);
            return (
              <div
                key={category.id}
                className={`flex w-full flex-col rounded-cute-m ${
                  isExpanded ? "bg-cute-surface-alt p-3.5" : ""
                }`}
              >
                <div className={`flex w-full items-center gap-3 ${isExpanded ? "" : "p-2.5"}`}>
                  <CategoryBadge
                    iconSrc={ui.iconSrc}
                    iconName={ui.iconName}
                    colour={ui.colour}
                    size={46}
                  />
                  <div className="flex flex-1 flex-col gap-px">
                    <p className="font-heading text-[15px] font-medium text-cute-text">
                      {category.name}
                    </p>
                    <p className="font-body text-xs text-cute-text-muted">
                      {category.itemCount ?? 0} {category.itemCount === 1 ? "item" : "items"}
                      {(category.locations?.length ?? 0) > 0 &&
                        ` (${category.locations.join(" + ")})`}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      aria-label={`Edit ${category.name}`}
                      onClick={() => setEditingCategory(category)}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-cute-text-muted transition hover:bg-cute-surface"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${category.name}`}
                      onClick={() =>
                        setPendingDelete({
                          title: `Delete "${category.name}"?`,
                          message:
                            "Its subcategories are removed too; items keep existing but lose this category.",
                          action: () => deleteCategory(category.id),
                          affectsItems: true,
                        })
                      }
                      className="flex h-9 w-9 items-center justify-center rounded-full text-cute-text-muted transition hover:bg-cute-surface hover:text-cute-danger"
                    >
                      <Trash2 size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label={isExpanded ? `Collapse ${category.name}` : `Expand ${category.name}`}
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
                      {category.subCategories.map((sub) => (
                        <span
                          key={sub.id}
                          className="flex items-center gap-1.5 rounded-full border border-cute-border bg-cute-surface py-1.5 pr-2.5 pl-3.5 font-body text-xs text-cute-text"
                        >
                          {sub.name}
                          <button
                            type="button"
                            aria-label={`Remove ${sub.name}`}
                            onClick={() =>
                              setPendingDelete({
                                title: `Remove "${sub.name}"?`,
                                message:
                                  "Items in this subcategory keep existing but lose their category.",
                                action: () => deleteSubCategory(sub.id),
                                affectsItems: true,
                              })
                            }
                            className="text-cute-text-muted transition hover:text-cute-danger"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                      <InlineAdd
                        label="Add Subcategory"
                        placeholder="Subcategory name"
                        onAdd={(name) => run(() => createSubCategory(category.id, name))}
                      />
                    </div>

                    <div className="flex flex-col gap-2 pt-2.5 pl-[52px]">
                      <p className="font-body text-xs font-semibold text-cute-text-muted">Tags</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {(category.tags ?? []).map((tag) => (
                            <span
                              key={tag.id}
                              className="flex items-center gap-1.5 rounded-full py-1.5 pr-2.5 pl-3.5 font-body text-xs"
                              style={{
                                backgroundColor: tag.colour ?? "#E7E2EE",
                                color: "#4A3F55",
                              }}
                            >
                              {tag.name}
                              <button
                                type="button"
                                aria-label={`Remove ${tag.name} tag from ${category.name}`}
                                onClick={() => run(() => detachTag(category.id, tag.id))}
                                className="transition hover:opacity-70"
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                        <InlineAdd
                          label="Add Tag"
                          placeholder="Tag name"
                          onAdd={(name) => run(() => attachTag(category.id, name))}
                        />
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
          onClick={() => setAddingCategory(true)}
          className="flex w-full shrink-0 items-center justify-center gap-2 rounded-cute-m border-[1.5px] border-cute-border p-3.5 font-body text-sm font-semibold text-cute-text transition hover:bg-cute-surface-alt"
        >
          <Plus size={16} />
          Add Category
        </button>
        </div>
      </div>
      {editorOpen && (
        <EditCategoryModal
          category={editingCategory ?? undefined}
          onClose={() => {
            setEditingCategory(null);
            setAddingCategory(false);
          }}
          onSaved={(saved) => {
            changes.current.categories ||= saved.categories;
            changes.current.items ||= saved.items;
            refresh();
          }}
        />
      )}
      {pendingDelete && (
        <ConfirmDeleteModal
          title={pendingDelete.title}
          message={pendingDelete.message}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            await run(pendingDelete.action, pendingDelete.affectsItems);
            setPendingDelete(null);
          }}
        />
      )}
    </div>
  );
}
