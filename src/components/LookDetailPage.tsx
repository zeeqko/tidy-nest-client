import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Pencil, Trash2 } from "lucide-react";
import { MobileTopBar } from "./MobileTopBar";
import { OutfitCanvas } from "./OutfitCanvas";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { useLook } from "../hooks/useLook";
import { deleteLook, type ApiLookItem } from "../api/looks";
import { fallbackPreset } from "../data/presentation";
import type { PlacedItem } from "./OutfitBuilderPage";

/** Maps a saved look's `ApiLookItem`s onto the canvas's `PlacedItem` shape.
 *  `ApiLookItem` has no per-placement `id`, so one is synthesised from the
 *  item's index in the (stable, backend-ordered) array — deterministic
 *  across re-renders, unlike `crypto.randomUUID()`. It also carries no
 *  icon/colour fallback, since the response has no category info to derive
 *  one from; every placed item uses the shared `fallbackPreset` for that
 *  case (only ever shown while `cutoutURL`/`imageURL` are both empty, since
 *  `OutfitCanvas` prefers the image over the fallback tile whenever either
 *  is present). Exported so T10's edit flow can reuse the same mapping
 *  instead of duplicating it. */
export function toPlacedItems(items: ApiLookItem[]): PlacedItem[] {
  return items.map((item, index) => ({
    id: `${item.itemId}-${index}`,
    itemId: item.itemId,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    rotation: item.rotation,
    zIndex: item.zIndex,
    name: item.name ?? "Item",
    imageURL: item.imageURL,
    cutoutURL: item.cutoutURL,
    icon: fallbackPreset.icon,
    iconBg: fallbackPreset.iconBg,
    iconColor: fallbackPreset.iconColor,
  }));
}

/** Occasion badge treatment lifted from `LookCard`'s thumbnail overlay,
 *  minus the absolute positioning that only makes sense pinned over an
 *  image — same visual chip everywhere a look's occasion is shown. */
function OccasionBadge({ occasion }: { occasion: string }) {
  return (
    <span className="max-w-full truncate rounded-full bg-white/90 px-2.5 py-1 font-body text-[11px] font-semibold text-cute-text shadow-[0_1px_3.5px_-1px_rgba(0,0,0,0.06)]">
      {occasion}
    </span>
  );
}

/** Read-only Look detail page: header (name, occasion, piece count) plus a
 *  non-interactive `OutfitCanvas` reconstructing the saved arrangement, and
 *  Edit / Delete actions. Loading/error copy mirrors `StyleBookPage`; a 404
 *  (unknown id or another user's look — indistinguishable server-side)
 *  renders a dedicated not-found block instead of a blank page or crash. */
export function LookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { look, loading, error } = useLook(id);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const goToEdit = () => id && navigate(`/stylebook/${id}/edit`);

  const confirmDelete = async () => {
    if (!id) return;
    try {
      await deleteLook(id);
      navigate("/stylebook");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete this look");
      setConfirmingDelete(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center">
        <p className="font-body text-sm text-cute-text-muted">Loading look…</p>
      </div>
    );
  }

  if (!look) {
    if (error && error !== "look not found") {
      return (
        <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="font-body text-sm text-cute-danger">
            Couldn't load this look from the server: {error}
          </p>
          <Link to="/stylebook" className="font-body text-sm font-semibold text-cute-primary hover:underline">
            Back to Style Book
          </Link>
        </div>
      );
    }
    return (
      <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-heading text-xl font-semibold text-cute-text">Look not found</p>
        <p className="font-body text-sm text-cute-text-muted">
          This look may have been deleted, or the link isn't right.
        </p>
        <Link to="/stylebook" className="font-body text-sm font-semibold text-cute-primary hover:underline">
          Back to Style Book
        </Link>
      </div>
    );
  }

  const pieceCount = look.items.length;
  const placedItems = toPlacedItems(look.items);

  return (
    <div className="w-full px-5 pt-2 pb-10 sm:px-10">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 sm:gap-9">
        <MobileTopBar title={look.name} backTo="/stylebook" />

        {/* Mobile-only occasion + piece count row — MobileTopBar only carries the title. */}
        <div className="flex flex-wrap items-center gap-2 sm:hidden">
          {look.occasion && <OccasionBadge occasion={look.occasion} />}
          <p className="font-body text-xs text-cute-text-muted">
            {pieceCount} {pieceCount === 1 ? "piece" : "pieces"}
          </p>
        </div>

        <div className="hidden sm:block">
          <div className="flex w-full items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-heading text-2xl font-semibold text-cute-text">{look.name}</h1>
                {look.occasion && <OccasionBadge occasion={look.occasion} />}
              </div>
              <p className="font-body text-sm text-cute-text-muted">
                {pieceCount} {pieceCount === 1 ? "piece" : "pieces"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              <button
                type="button"
                onClick={goToEdit}
                className="flex items-center gap-1.5 rounded-full bg-cute-primary px-4 py-2.5 font-body text-sm font-medium text-cute-primary-foreground transition hover:brightness-105"
              >
                <Pencil size={16} />
                Edit Look
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="flex items-center gap-1.5 rounded-full border-[1.5px] border-cute-destructive bg-cute-surface px-4 py-2.5 font-body text-sm font-semibold text-cute-destructive transition hover:bg-cute-destructive/10"
              >
                <Trash2 size={16} />
                Delete
              </button>
            </div>
          </div>
        </div>

        <div className="w-full sm:w-[440px]">
          <OutfitCanvas readOnly items={placedItems} />
        </div>

        <div className="flex w-full gap-2.5 sm:hidden">
          <button
            type="button"
            onClick={goToEdit}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-cute-primary px-4 py-[13px] font-body text-sm font-semibold text-cute-primary-foreground transition hover:brightness-105"
          >
            <Pencil size={16} />
            Edit Look
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full border-[1.5px] border-cute-destructive bg-cute-surface px-4 py-[13px] font-body text-sm font-semibold text-cute-destructive transition hover:bg-cute-destructive/10"
          >
            <Trash2 size={16} />
            Delete
          </button>
        </div>

        {deleteError && <p className="font-body text-sm text-cute-danger">{deleteError}</p>}
      </div>

      {confirmingDelete && (
        <ConfirmDeleteModal
          title={`Delete "${look.name}"?`}
          message="This removes the look from your Style Book. This can't be undone."
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
