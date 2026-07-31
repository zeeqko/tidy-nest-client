import { useCallback, useEffect, useRef, useState } from "react";
import { X, Pencil, Trash2, Plus, ChevronDown, ChevronUp } from "lucide-react";
import {
  attachTag,
  deleteCategory,
  deleteSubCategory,
  detachTag,
  createSubCategory,
  listCategories,
  type ApiCategory,
} from "../api/categories";
import { toUiCategory } from "../data/categories";
import type { RefreshScope } from "../types";
import { CategoryBadge } from "./CategoryBadge";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { EditCategoryModal } from "./EditCategoryModal";
import { InlineAdd } from "./InlineAdd";
import { ModalShell } from "./ModalShell";

interface ManageCategoriesModalProps {
  /** Receives what changed while the modal was open, for selective refresh. */
  onClose: (changes: RefreshScope) => void;
  /**
   * Parent-supplied categories (contract C1). When provided, the modal renders
   * these instead of self-fetching, and calls `onChanged()` after each mutation
   * instead of refetching itself. When omitted, today's self-fetching behaviour
   * is preserved so existing callers need no changes.
   */
  apiCategories?: ApiCategory[];
  onChanged?: () => void | Promise<void>;
}

interface PendingDelete {
  title: string;
  message: string;
  action: () => Promise<unknown>;
  /** Whether the deletion changes what items display (category/subcategory). */
  affectsItems?: boolean;
}

export function ManageCategoriesModal({
  onClose,
  apiCategories: apiCategoriesProp,
  onChanged,
}: ManageCategoriesModalProps) {
  const controlled = apiCategoriesProp !== undefined;
  // Self-fetch fallback, only used when the parent doesn't supply apiCategories.
  const [fetchedCategories, setFetchedCategories] = useState<ApiCategory[]>([]);
  const selfRefresh = useCallback(async () => {
    try {
      setFetchedCategories(await listCategories());
    } catch {
      // Swallowed to match the previous self-fetching hook's behaviour, which
      // never surfaced load failures through this modal's own error banner.
    }
  }, []);
  useEffect(() => {
    if (!controlled) selfRefresh();
    // Intentionally run once per mount for the self-fetching fallback; whether
    // this instance is controlled doesn't change over its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const apiCategories = controlled ? apiCategoriesProp : fetchedCategories;

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingCategory, setEditingCategory] = useState<ApiCategory | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [error, setError] = useState<string | null>(null);
  const changes = useRef<RefreshScope>({ categories: false, items: false });
  const listRef = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef<number | null>(null);

  const editorOpen = editingCategory !== null || addingCategory;
  const close = () => onClose(changes.current);

  // Opening the editor mounts EditCategoryModal, which autofocuses its name
  // input; capture this list's scroll position beforehand and restore it
  // right after mount so any browser auto-scroll-into-view doesn't leave the
  // list jumped to a different position than where the user opened it from.
  const openEditor = (open: () => void) => {
    savedScrollTop.current = listRef.current?.scrollTop ?? null;
    open();
  };

  useEffect(() => {
    if (editorOpen && savedScrollTop.current !== null && listRef.current) {
      listRef.current.scrollTop = savedScrollTop.current;
    }
  }, [editorOpen]);

  // Escape/backdrop no-ops while a delete confirmation or the category
  // editor is open — enforced via ModalShell's `closeGuard`.
  const closeGuard = useCallback(() => !pendingDelete && !editorOpen, [pendingDelete, editorOpen]);

  const run = async (action: () => Promise<unknown>, affectsItems = false) => {
    try {
      setError(null);
      await action();
      changes.current.categories = true;
      if (affectsItems) changes.current.items = true;
      if (controlled) {
        await onChanged?.();
      } else {
        await selfRefresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      throw err;
    }
  };

  return (
    <>
    <ModalShell
      level="base"
      onClose={close}
      closeGuard={closeGuard}
      maxWidthClassName="sm:max-w-[780px]"
      bodyRef={listRef}
      title="Edit Categories"
      subtitle="Organize your items by type, not just location"
    >
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
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Edit ${category.name}`}
                      onClick={() => openEditor(() => setEditingCategory(category))}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-cute-text-muted transition hover:bg-cute-surface"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label={isExpanded ? `Collapse ${category.name}` : `Expand ${category.name}`}
                      onClick={() => setExpandedId(isExpanded ? null : category.id)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-cute-text-muted transition hover:bg-cute-surface"
                    >
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                    {/* Divider + always-on red tint keep Delete from reading as just
                        another icon in the row, so a mis-tap aimed at Edit/Expand
                        can't land on it. */}
                    <span className="h-6 w-px shrink-0 bg-cute-border" aria-hidden="true" />
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
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-cute-destructive transition hover:bg-cute-destructive/10"
                    >
                      <Trash2 size={15} />
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
                            className="text-cute-text-muted transition hover:text-cute-destructive"
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
                                onClick={() => {
                                  // Error (if any) is already surfaced via the
                                  // banner by run(); nothing here needs the rejection.
                                  run(() => detachTag(category.id, tag.id)).catch(() => {});
                                }}
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
          onClick={() => openEditor(() => setAddingCategory(true))}
          className="flex w-full shrink-0 items-center justify-center gap-2 rounded-cute-m border-[1.5px] border-cute-border p-3.5 font-body text-sm font-semibold text-cute-text transition hover:bg-cute-surface-alt"
        >
          <Plus size={16} />
          Add Category
        </button>
    </ModalShell>
    {/* Both rendered as siblings, not nested, so their own ModalShell
        overlays (level="elevated"/"alert") paint above this one at the
        shared z-scale, layering Manage Categories → Edit Category →
        Confirm Delete correctly. */}
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
          if (controlled) {
            // Matches run()'s handling of the same parent-supplied callback:
            // a rejection here has nowhere useful to go, so swallow it
            // rather than let it surface as an unhandled rejection.
            onChanged?.()?.catch(() => {});
          } else {
            selfRefresh();
          }
        }}
      />
    )}
    {pendingDelete && (
      <ConfirmDeleteModal
        title={pendingDelete.title}
        message={pendingDelete.message}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          try {
            await run(pendingDelete.action, pendingDelete.affectsItems);
          } catch {
            // Error message already recorded by run(); still dismiss the dialog.
          } finally {
            setPendingDelete(null);
          }
        }}
      />
    )}
    </>
  );
}
