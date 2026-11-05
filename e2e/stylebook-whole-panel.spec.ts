// End-to-end tests for "use the whole panel": pieces in the Outfit Builder
// can be moved anywhere in the canvas panel (into the margins around the
// 400x711 base space), coordinates outside the base space are saved as is,
// and a look whose pieces lie outside what a panel shows by default (built
// on a wider panel, or the window shrunk) opens zoomed out so every piece is
// visible. Runs in the desktop (1440x900, mouse) and mobile (390x844, touch)
// projects; viewport-specific tests skip themselves.
import type { Page, TestInfo } from "@playwright/test";
import { test, expect, ITEM_NAMES, type Api, type ApiLook, type Closet } from "./fixtures";
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  addPiece,
  canvasNodes,
  canvasPanel,
  expectPiecesInsideCanvas,
  nodeClientRects,
  nodeScreenCenter,
  nodeScreenRect,
  openBuilder,
  outfitCanvas,
  pointerDrag,
  pointerHold,
  rotatedBox,
  saveLookChanges,
  saveNewLook,
  saveScreenshot,
  selectGroup,
  stageTransform,
  undoButton,
  viewInfo,
  type CanvasNode,
} from "./support/canvas";

const { linen, denim, sneakers } = ITEM_NAMES;

function expectSameNodes(actual: CanvasNode[], expected: CanvasNode[]) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((node, i) => {
    for (const key of ["x", "y", "width", "height", "rotation"] as const) {
      expect(node[key], `node ${i} ${key}`).toBeCloseTo(expected[i][key], 6);
    }
  });
}

const byZ = (look: ApiLook) => [...look.items].sort((a, b) => a.zIndex - b.zIndex);
const asNodes = (look: ApiLook): CanvasNode[] => byZ(look).map((i) => ({ ...i, cls: "", fill: null }));

/** Waits until the stage has drawn `count` pieces with their pictures. */
async function waitForPieces(page: Page, count: number) {
  await expect.poll(async () => (await canvasNodes(page)).length).toBe(count);
  await expect.poll(async () => (await canvasNodes(page)).filter((n) => n.hasImage).length).toBe(count);
}

/**
 * Drags the piece at `nodeIndex` to the panel's left or right edge (aiming
 * past it). On the way it holds the pointer in the panel's former margin
 * (outside the base 400x711 space's on-screen rect) and checks that the
 * piece's centre follows the pointer there unclamped. Returns the piece's
 * on-screen rect after the drop and the canvas box.
 */
async function dragToSideEdge(page: Page, testInfo: TestInfo, nodeIndex: number, side: "left" | "right") {
  const area = (await outfitCanvas(page).boundingBox())!;
  const view = await viewInfo(page);
  const rect = await nodeScreenRect(page, nodeIndex);
  const from = await nodeScreenCenter(page, nodeIndex);
  // Base space's on-screen left / right edges.
  const baseLeft = area.x + view.offsetX;
  const baseRight = baseLeft + DESIGN_WIDTH * view.scale;
  // A pointer spot whose piece centre lies in the margin, piece fully inside.
  const marginX = side === "left" ? area.x + rect.width / 2 + 6 : area.x + area.width - rect.width / 2 - 6;
  expect(
    side === "left" ? marginX < baseLeft : marginX > baseRight,
    `the panel has room outside the base space on the ${side} (margin spot ${marginX}, base ${baseLeft}..${baseRight})`,
  ).toBe(true);
  const y = Math.min(Math.max(from.y, area.y + rect.height / 2 + 6), area.y + area.height - rect.height / 2 - 6);

  const hold = await pointerHold(page, testInfo, from);
  await hold.moveTo({ x: marginX, y }, 16);
  await page.waitForTimeout(100);
  const following = await nodeScreenCenter(page, nodeIndex);
  expect(Math.abs(following.x - marginX), `${side}: the piece follows the pointer into the margin`).toBeLessThanOrEqual(1);
  expect(Math.abs(following.y - y)).toBeLessThanOrEqual(1);
  // Past the panel edge: the piece stops at it.
  await hold.moveTo({ x: side === "left" ? area.x + 2 : area.x + area.width - 2, y }, 8);
  await hold.release();
  await page.waitForTimeout(300);
  return { piece: await nodeScreenRect(page, nodeIndex), area };
}

/** A look (made via the API) whose pieces lie well outside the base space:
 *  in the left margin, the right margin and below it (one rotated). */
async function createMarginLook(userApi: Api, closet: Closet) {
  const id = (name: string) => closet.items[name].id;
  return userApi.createLook({
    name: "Margin Look",
    occasion: "",
    items: [
      { itemId: id(linen), x: -230.5, y: 40.25, width: 120, height: 180, rotation: 0, zIndex: 0 },
      { itemId: id(denim), x: 470.75, y: 420.5, width: 130, height: 190, rotation: 20, zIndex: 1 },
      { itemId: id(sneakers), x: 150, y: 760.125, width: 90, height: 60, rotation: 0, zIndex: 2 },
    ],
  });
}

test.describe("whole panel", () => {
  test("(a) desktop: a piece dragged far left / right follows the pointer into the former margins and stops at the panel edge; the coordinates are saved as is", async ({
    authedPage: page,
    userApi,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "desktop scenario (the phone variant is (c))");
    await openBuilder(page);
    await addPiece(page, linen, 1);
    await addPiece(page, denim, 2);
    await selectGroup(page, "Shoes");
    await addPiece(page, sneakers, 3);
    await waitForPieces(page, 3);
    const start = await viewInfo(page);
    expect(start.scale, "an empty / base-only look gets the plain contain-fit").toBeCloseTo(start.baseScale, 6);

    // Piece 0 far left, piece 1 far right.
    const left = await dragToSideEdge(page, testInfo, 0, "left");
    expect(Math.abs(left.piece.x - left.area.x), "left piece touches the panel's left edge").toBeLessThanOrEqual(1);
    const right = await dragToSideEdge(page, testInfo, 1, "right");
    expect(
      Math.abs(right.piece.x + right.piece.width - (right.area.x + right.area.width)),
      "right piece touches the panel's right edge",
    ).toBeLessThanOrEqual(1);
    await expectPiecesInsideCanvas(page, "desktop after the side drags");
    const panel = (await canvasPanel(page).boundingBox())!;
    for (const i of [0, 1]) {
      const r = await nodeScreenRect(page, i);
      expect(r.x).toBeGreaterThanOrEqual(panel.x - 0.5);
      expect(r.x + r.width).toBeLessThanOrEqual(panel.x + panel.width + 0.5);
    }
    // The view never moved during the drags.
    expect(await viewInfo(page)).toEqual(start);

    const nodes = await canvasNodes(page);
    expect(nodes[0].x, "left piece is left of the base space").toBeLessThan(0);
    expect(nodes[1].x + nodes[1].width, "right piece is right of the base space").toBeGreaterThan(DESIGN_WIDTH);
    expect(rotatedBox(nodes[0]).left).toBeCloseTo(start.visible.x, 3);
    expect(rotatedBox(nodes[1]).right).toBeCloseTo(start.visible.x + start.visible.width, 3);
    await saveScreenshot(page, testInfo, "wp-a-desktop-margins");

    const id = await saveNewLook(page, "Whole Panel Look");
    const saved = await userApi.look(id);
    expectSameNodes(asNodes(saved), nodes);
    expect(byZ(saved)[0].x).toBeLessThan(0);
    expect(byZ(saved)[1].x + byZ(saved)[1].width).toBeGreaterThan(DESIGN_WIDTH);

    // The detail page shows the whole look, unclipped.
    await waitForPieces(page, 3);
    await expectPiecesInsideCanvas(page, "detail page");

    // (b) Reopen in the editor on a phone-sized window: the pieces in the
    // desktop margins are outside the phone panel's base view, so it zooms
    // out until every piece is visible.
    await page.setViewportSize({ width: 390, height: 844 });
    await openBuilder(page, `/stylebook/${id}/edit`);
    await waitForPieces(page, 3);
    await page.waitForTimeout(300);
    expectSameNodes(await canvasNodes(page), nodes);
    const phone = await viewInfo(page);
    expect(phone.scale, "zoomed out below the base contain-fit").toBeLessThan(phone.baseScale - 1e-3);
    await expectPiecesInsideCanvas(page, "phone after load");
    await saveScreenshot(page, testInfo, "wp-b-phone-zoomed-out");

    // Dragging (and undoing) after the load never changes the view.
    const before = await stageTransform(page);
    const from = await nodeScreenCenter(page, 2);
    await pointerDrag(page, testInfo, from, { x: from.x + 20, y: from.y - 15 }, 8);
    await page.waitForTimeout(300);
    expect((await canvasNodes(page))[2].x, "the dragged piece moved").not.toBeCloseTo(nodes[2].x, 3);
    expect(await stageTransform(page), "no jump after a drag").toEqual(before);
    await undoButton(page).click();
    await expect.poll(async () => (await canvasNodes(page))[2].x).toBeCloseTo(nodes[2].x, 6);
    expect(await stageTransform(page), "no jump after undo").toEqual(before);

    // Back to the desktop size: the view is recomputed (the pieces fit the
    // desktop panel's visible area again, so it is the plain contain-fit).
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(400);
    const desktop = await viewInfo(page);
    expect(desktop.stage).not.toEqual(phone.stage);
    expect(desktop.scale).toBeCloseTo(desktop.baseScale, 6);
    await expectPiecesInsideCanvas(page, "desktop after resizing back");

    // Unchanged pieces save back exactly.
    await saveLookChanges(page, id);
    expect(asNodes(await userApi.look(id)).map(({ x, y, width, height, rotation }) => ({ x, y, width, height, rotation }))).toEqual(
      asNodes(saved).map(({ x, y, width, height, rotation }) => ({ x, y, width, height, rotation })),
    );
  });

  test("(b) a look with pieces beyond the base space opens with every piece visible, zoomed out just enough", async ({
    authedPage: page,
    userApi,
    closet,
  }, testInfo) => {
    const look = await createMarginLook(userApi, closet);
    await openBuilder(page, `/stylebook/${look.id}/edit`);
    await waitForPieces(page, 3);
    await page.waitForTimeout(300);
    expectSameNodes(await canvasNodes(page), asNodes(look));
    const view = await viewInfo(page);
    // The sneakers sit below 711, outside every panel's base view.
    expect(view.scale).toBeLessThan(view.baseScale - 1e-3);
    await expectPiecesInsideCanvas(page, "after load");
    // Just enough: the union of the base space and the pieces (plus a
    // 12-unit padding) is contain-fitted, so it touches the panel on one axis.
    const boxes = (await canvasNodes(page)).map(rotatedBox);
    const union = {
      left: Math.min(0, ...boxes.map((b) => b.left - 12)),
      top: Math.min(0, ...boxes.map((b) => b.top - 12)),
      right: Math.max(DESIGN_WIDTH, ...boxes.map((b) => b.right + 12)),
      bottom: Math.max(DESIGN_HEIGHT, ...boxes.map((b) => b.bottom + 12)),
    };
    const fitScale = Math.min(view.stage.width / (union.right - union.left), view.stage.height / (union.bottom - union.top));
    expect(view.scale).toBeCloseTo(fitScale, 6);
    await saveScreenshot(page, testInfo, "wp-b-margin-look-editor");
  });

  test("(c) phone: a piece dragged to the far left / right stays inside the panel", async ({ authedPage: page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "phone scenario");
    await openBuilder(page);
    await addPiece(page, linen, 1);
    await addPiece(page, denim, 2);
    await waitForPieces(page, 2);
    const start = await viewInfo(page);

    const left = await dragToSideEdge(page, testInfo, 0, "left");
    expect(Math.abs(left.piece.x - left.area.x), "left piece touches the panel's left edge").toBeLessThanOrEqual(1);
    const right = await dragToSideEdge(page, testInfo, 1, "right");
    expect(
      Math.abs(right.piece.x + right.piece.width - (right.area.x + right.area.width)),
      "right piece touches the panel's right edge",
    ).toBeLessThanOrEqual(1);
    await expectPiecesInsideCanvas(page, "phone after the side drags");
    expect(await viewInfo(page)).toEqual(start);
    const nodes = await canvasNodes(page);
    expect(rotatedBox(nodes[0]).left).toBeCloseTo(start.visible.x, 3);
    expect(rotatedBox(nodes[1]).right).toBeCloseTo(start.visible.x + start.visible.width, 3);
    expect(nodes[0].x, "left piece is in the former left margin").toBeLessThan(0);
    expect(nodes[1].x + nodes[1].width, "right piece is in the former right margin").toBeGreaterThan(DESIGN_WIDTH);
    await saveScreenshot(page, testInfo, "wp-c-phone-margins");
  });

  test("(e) the detail page of a look with out-of-base coordinates shows every piece unclipped", async ({
    authedPage: page,
    userApi,
    closet,
  }, testInfo) => {
    const look = await createMarginLook(userApi, closet);
    await page.goto(`/stylebook/${look.id}`);
    await expect(page.getByText("3 pieces").filter({ visible: true })).toBeVisible();
    await waitForPieces(page, 3);
    expectSameNodes(await canvasNodes(page), asNodes(look));
    const { stage, rects } = await nodeClientRects(page);
    await expectPiecesInsideCanvas(page, "detail");
    // Cropped to the pieces: the leftmost piece is near the left edge of the
    // detail canvas, not pushed off it.
    expect(Math.min(...rects.map((r: { x: number }) => r.x))).toBeLessThan(stage.width / 4);
    await saveScreenshot(page, testInfo, "wp-e-detail", { fullPage: true });
  });

  test("(f) the Style Book card's thumbnail includes every piece of such a look", async ({
    authedPage: page,
    userApi,
    closet,
  }, testInfo) => {
    await createMarginLook(userApi, closet);
    await page.goto("/stylebook");
    const card = page.locator('[role="button"]').filter({ has: page.getByRole("heading", { name: "Margin Look" }) });
    await expect(card).toBeVisible();
    const composite = card.locator(".isolate.aspect-square");
    const pieces = composite.locator(":scope > div.absolute");
    await expect(pieces).toHaveCount(3);
    await expect
      .poll(() => composite.locator("img").evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).complete)))
      .toBe(true);
    const band = await composite.evaluate((el) => el.getBoundingClientRect().toJSON());
    const boxes = await pieces.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
    for (const [i, b] of boxes.entries()) {
      expect(b.left, `piece ${i} left inside the thumbnail`).toBeGreaterThanOrEqual(band.left - 0.5);
      expect(b.top, `piece ${i} top inside the thumbnail`).toBeGreaterThanOrEqual(band.top - 0.5);
      expect(b.right, `piece ${i} right inside the thumbnail`).toBeLessThanOrEqual(band.right + 0.5);
      expect(b.bottom, `piece ${i} bottom inside the thumbnail`).toBeLessThanOrEqual(band.bottom + 0.5);
    }
    // Cropped to the pieces: together they span the thumbnail on one axis.
    const spanX = Math.max(...boxes.map((b) => b.right)) - Math.min(...boxes.map((b) => b.left));
    const spanY = Math.max(...boxes.map((b) => b.bottom)) - Math.min(...boxes.map((b) => b.top));
    expect(Math.max(spanX / band.width, spanY / band.height)).toBeGreaterThan(0.98);
    await saveScreenshot(page, testInfo, "wp-f-card", { target: card });
  });
});
