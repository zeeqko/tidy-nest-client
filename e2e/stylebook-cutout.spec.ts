// End-to-end tests for background removal of pieces already on the canvas:
// when an item's cutout becomes ready, every placed piece of it swaps from
// the photo to the cutout in place (same box), the "Removing background…"
// status shows meanwhile, Undo/Redo keep the cutout, and a failed removal
// leaves the photo with a quiet, transient note. Runs in the desktop
// (1440x900, mouse) and mobile (390x844, touch) projects.
//
// The real removal can't run here (its ML model comes from a CDN and the e2e
// browser aborts cross-origin requests), so the removal Worker is stubbed via
// `installFakeCutoutWorker`; the rest of the pipeline (photo fetch, downscale,
// upload, persist onto the item) runs for real against the e2e backend.
import type { Page } from "@playwright/test";
import { test, expect, ITEM_NAMES, seedPhotoOnlyItem } from "./fixtures";
import {
  addPiece,
  addTile,
  canvasNodes,
  cutoutStatus,
  openBuilder,
  redoButton,
  saveScreenshot,
  undoButton,
  type CanvasNode,
} from "./support/canvas";
import { fakeCutoutRequests, installFakeCutoutWorker, releaseFakeCutouts } from "./support/fakeCutoutWorker";

const BLOUSE = "Silk Blouse";
const REMOVING = "Removing background…";
const { linen } = ITEM_NAMES;

const geometry = ({ x, y, width, height, rotation }: CanvasNode) => ({ x, y, width, height, rotation });

/** The placed node of the photo-only item (the one drawing `photoURL` or a
 *  fresh `/uploads/…png` that isn't the closet photo). */
async function blouseNode(page: Page, srcEnds: string[]) {
  const nodes = await canvasNodes(page);
  return nodes.find((n) => srcEnds.some((end) => n.imageSrc?.endsWith(end))) ?? null;
}

test.describe("cutout swap on the canvas", () => {
  test("a piece added without a cutout swaps to it in place once ready; Undo/Redo keep it", async ({
    authedPage: page,
    userApi,
    closet,
  }, testInfo) => {
    await installFakeCutoutWorker(page, { mode: "ok", hold: true });
    const blouse = await seedPhotoOnlyItem(userApi, BLOUSE);
    await openBuilder(page);

    // Idle: nothing in the status region.
    await expect(cutoutStatus(page)).toBeEmpty();

    await addPiece(page, BLOUSE, 1);
    await expect(cutoutStatus(page).getByText(REMOVING)).toBeVisible();
    await expect.poll(async () => (await canvasNodes(page))[0]?.imageSrc ?? "").toMatch(new RegExp(`${blouse.photoURL}$`));
    const before = (await canvasNodes(page))[0];

    // A second piece (already has a cutout: no status for it) gives Undo
    // something to step through after the swap.
    await addPiece(page, linen, 2);
    await expect.poll(async () => (await canvasNodes(page)).filter((n) => n.hasImage).length).toBe(2);
    await expect(cutoutStatus(page).getByText(REMOVING)).toBeVisible();
    await saveScreenshot(page, testInfo, "cutout-pending");

    await releaseFakeCutouts(page);

    // The item now carries a persisted cutout (a fresh upload, not the photo)...
    await expect.poll(async () => (await userApi.item(blouse.id)).cutoutURL ?? "").toMatch(/^\/uploads\/[0-9a-f]{32}\.png$/);
    const cutoutURL = (await userApi.item(blouse.id)).cutoutURL!;
    expect(cutoutURL).not.toBe(blouse.photoURL);
    expect(cutoutURL).not.toBe(closet.photoURL);

    // ...and the placed piece draws it, in exactly the same box.
    await expect.poll(async () => (await blouseNode(page, [cutoutURL]))?.imageSrc ?? null).not.toBeNull();
    const after = (await blouseNode(page, [cutoutURL]))!;
    expect(geometry(after)).toEqual(geometry(before));
    await expect(cutoutStatus(page).getByText(REMOVING)).toHaveCount(0);
    await expect(cutoutStatus(page)).toBeEmpty();
    // The picker tile shows the cutout too.
    await expect(addTile(page, BLOUSE).locator("img")).toHaveAttribute("src", cutoutURL);
    await saveScreenshot(page, testInfo, "cutout-swapped");

    // The swap was not an edit: one Undo removes the linen shirt (the last
    // add), the blouse keeps its cutout.
    await undoButton(page).click();
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(1);
    expect((await canvasNodes(page))[0].imageSrc).toMatch(new RegExp(`${cutoutURL}$`));
    // Undo the blouse add too, then Redo it back: still the cutout.
    await undoButton(page).click();
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(0);
    await expect(undoButton(page)).toBeDisabled();
    await redoButton(page).click();
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(1);
    await expect.poll(async () => (await canvasNodes(page))[0].imageSrc ?? "").toMatch(new RegExp(`${cutoutURL}$`));
    expect(geometry((await canvasNodes(page))[0])).toEqual(geometry(before));
    await redoButton(page).click();
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(2);
    expect(await blouseNode(page, [cutoutURL]), "blouse still drawn as its cutout").not.toBeNull();
    expect(await blouseNode(page, [blouse.photoURL]), "no piece reverted to the photo").toBeNull();
    // The background removal ran once for the item.
    expect(await fakeCutoutRequests(page)).toBe(1);
  });

  test("a failed removal keeps the photo and shows a quiet note that hides itself", async ({
    authedPage: page,
    userApi,
  }, testInfo) => {
    await installFakeCutoutWorker(page, { mode: "fail", hold: true });
    const blouse = await seedPhotoOnlyItem(userApi, BLOUSE);
    await openBuilder(page);
    await addPiece(page, BLOUSE, 1);
    await expect(cutoutStatus(page).getByText(REMOVING)).toBeVisible();
    await expect.poll(async () => (await canvasNodes(page))[0]?.imageSrc ?? "").toMatch(new RegExp(`${blouse.photoURL}$`));
    const before = (await canvasNodes(page))[0];

    await releaseFakeCutouts(page);
    const note = cutoutStatus(page).getByText(`Couldn't remove the background for ${BLOUSE}`);
    await expect(note).toBeVisible();
    await expect(cutoutStatus(page).getByText(REMOVING)).toHaveCount(0);
    await saveScreenshot(page, testInfo, "cutout-failed");
    // The note never blocks the canvas.
    expect(await cutoutStatus(page).evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");

    const after = (await canvasNodes(page))[0];
    expect(after.imageSrc).toMatch(new RegExp(`${blouse.photoURL}$`));
    expect(geometry(after)).toEqual(geometry(before));
    expect((await userApi.item(blouse.id)).cutoutURL ?? "", "nothing persisted").toBe("");

    // Transient: gone after ~5 s.
    await expect(note).toHaveCount(0, { timeout: 9_000 });
    await expect(cutoutStatus(page)).toBeEmpty();
  });

  test("edit mode: a saved piece without a cutout swaps to one after the look opens, without an undo step", async ({
    authedPage: page,
    userApi,
  }, testInfo) => {
    await installFakeCutoutWorker(page, { mode: "ok", hold: true });
    const blouse = await seedPhotoOnlyItem(userApi, BLOUSE);
    const placed = { itemId: blouse.id, x: 120, y: 200, width: 120, height: 180, rotation: 10, zIndex: 1 };
    const look = await userApi.createLook({ name: "Blouse Look", occasion: "", items: [placed] });

    await openBuilder(page, `/stylebook/${look.id}/edit`);
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(1);
    await expect(cutoutStatus(page).getByText(REMOVING)).toBeVisible();
    await expect.poll(async () => (await canvasNodes(page))[0].imageSrc ?? "").toMatch(new RegExp(`${blouse.photoURL}$`));

    await releaseFakeCutouts(page);
    await expect.poll(async () => (await userApi.item(blouse.id)).cutoutURL ?? "").toMatch(/^\/uploads\/[0-9a-f]{32}\.png$/);
    const cutoutURL = (await userApi.item(blouse.id)).cutoutURL!;
    await expect.poll(async () => (await canvasNodes(page))[0].imageSrc ?? "").toMatch(new RegExp(`${cutoutURL}$`));
    await expect(cutoutStatus(page)).toBeEmpty();

    const node = (await canvasNodes(page))[0];
    for (const key of ["x", "y", "width", "height", "rotation"] as const) {
      expect(node[key], key).toBeCloseTo(placed[key], 6);
    }
    // Neither loading nor the swap is an edit.
    await expect(undoButton(page)).toBeDisabled();
    await expect(redoButton(page)).toBeDisabled();
    await saveScreenshot(page, testInfo, "cutout-edit-swapped");
  });
});
