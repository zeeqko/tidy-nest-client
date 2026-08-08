import { fallbackPreset } from "../data/presentation";
import type { ApiLookItem } from "../api/looks";
import type { PlacedItem } from "../components/OutfitBuilderPage";

/** Maps a saved look's `ApiLookItem`s onto the canvas's `PlacedItem` shape.
 *  `ApiLookItem` has no per-placement `id`, so one is synthesised from the
 *  item's index in the (stable, backend-ordered) array — deterministic
 *  across re-renders, unlike `crypto.randomUUID()`. It also carries no
 *  icon/colour fallback, since the response has no category info to derive
 *  one from; every placed item uses the shared `fallbackPreset` for that
 *  case (only ever shown while `cutoutURL`/`imageURL` are both empty, since
 *  `OutfitCanvas` prefers the image over the fallback tile whenever either
 *  is present). Shared (PLAN.md T2 decision 4) by `LookDetailPage`'s
 *  read-only canvas and `OutfitBuilderPage`'s edit mode, which both need to
 *  reconstruct the same saved arrangement from the same response shape. */
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
