// Owns the whole "get a cutout for this inventory item" pipeline used by the
// Outfit Builder (PLAN.md T2): fetch the item's photo → downscale (T1) →
// background removal → upload → persist onto the inventory item.
//
// This module must never throw and never reject — every failure mode (fetch
// fails, removeBackground resolves null, upload fails, persist fails)
// resolves to a well-defined `CutoutResult` the caller can branch on, not a
// rejected promise. Callers (OutfitBuilderPage) rely on this to swap the
// canvas placement over as soon as the upload succeeds, independent of
// whether the final persist step lands.
import { preparePhoto } from "./image";
import { removeBackground } from "./backgroundRemoval";
import { uploadImage } from "../api/uploads";
import { getItem, updateItem, type NewInventoryItem } from "../api/inventory";

export type CutoutResult =
  | { ok: true; cutoutURL: string; persisted: boolean }
  | { ok: false };

/**
 * Runs the full pipeline for one inventory item (identified by `itemId`,
 * whose current photo lives at `imageURL`):
 *
 * 1. Fetch `imageURL` as a Blob (same-origin `/uploads/...`, proxied to the
 *    Go backend — no CORS issue).
 * 2. Downscale it via `preparePhoto` (T1).
 * 3. Run `removeBackground` — resolves `Blob | null`, never throws.
 * 4. On a non-null result, upload it via `uploadImage`.
 * 5. Persist the resulting URL onto the inventory item via the
 *    `getItem` + `updateItem` full-replace pattern (decision 3): fetch the
 *    item's current full state, then resend every `NewInventoryItem` field
 *    explicitly with only `cutoutURL` changed.
 *
 * Resolves `{ ok: true, cutoutURL, persisted }` once the whole pipeline
 * (including the persist attempt) settles — `persisted` reflects whether the
 * backfill PUT also landed, so a caller can keep an in-session swap even
 * when the final persist step fails (the look still saves correctly; the
 * cutout just won't survive a reload). Resolves `{ ok: false }` if fetch,
 * downscale-fallback-and-removeBackground, or upload all fail to produce a
 * usable cutout — in that case `onCutoutReady` is never called and the
 * caller's placement should keep the original photo.
 *
 * `onCutoutReady`, if given, fires as soon as the upload succeeds — *before*
 * the persist step runs — so a caller can swap the canvas over immediately
 * per decision 5's "swap on upload, persist after" order, without waiting on
 * the (possibly slow, possibly failing) backfill `PUT`.
 */
export async function generateItemCutout(
  itemId: string,
  imageURL: string,
  onCutoutReady?: (cutoutURL: string) => void,
): Promise<CutoutResult> {
  try {
    const response = await fetch(imageURL);
    if (!response.ok) return { ok: false };
    const original = await response.blob();

    const { blob: prepared } = await preparePhoto(original, "photo.jpg");

    const cutoutBlob = await removeBackground(prepared);
    if (!cutoutBlob) return { ok: false };

    const uploaded = await uploadImage(cutoutBlob, "cutout.png");
    const cutoutURL = uploaded.url;
    onCutoutReady?.(cutoutURL);

    let persisted = false;
    try {
      const fresh = await getItem(itemId);
      const payload: NewInventoryItem = {
        name: fresh.name,
        category: fresh.category,
        subcategory: fresh.subcategory,
        location: fresh.location,
        quantity: fresh.quantity,
        tags: fresh.tags,
        notes: fresh.notes,
        imageURL: fresh.imageURL,
        cutoutURL,
        expiryDate: fresh.expiryDate,
        opensOn: fresh.opensOn,
      };
      await updateItem(itemId, payload);
      persisted = true;
    } catch (err) {
      // Swallowed by design (this module never rejects) — logged so a
      // silent "no cutout after reload" isn't a total mystery in the
      // console.
      console.warn(`itemCutout: failed to persist cutoutURL for item ${itemId}`, err);
      persisted = false;
    }

    return { ok: true, cutoutURL, persisted };
  } catch (err) {
    console.warn(`itemCutout: failed to generate a cutout for item ${itemId}`, err);
    return { ok: false };
  }
}
