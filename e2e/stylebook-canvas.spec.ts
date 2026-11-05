// End-to-end tests for the Stylebook Outfit Builder: picker tap-to-add and
// filters, the fixed (non-panning) canvas, save/reopen, the docked
// canvas + picker layout (which fits the viewport, with Save in the top bar),
// photo-less items, hidden categories, the category
// form's Stylebook group, and window resizing. Runs in the desktop (1440x900, mouse) and
// mobile (390x844, touch) projects; viewport-specific tests skip themselves.
import type { Page } from "@playwright/test";
import { test, expect, ITEM_NAMES, type ApiLook, type ApiLookItem } from "./fixtures";
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  addPiece,
  addTile,
  anchorPoint,
  boardInfo,
  boxesOverlap,
  canvasNodes,
  canvasPanel,
  countBadge,
  emptyCanvasPoint,
  mouseDrag,
  nodeClientRects,
  nodeScreenCenter,
  openBuilder,
  openSaveSheet,
  picker,
  pickerPanel,
  pickerScroller,
  pinch,
  pointerDrag,
  rotatedBox,
  removeCross,
  rotaterPoint,
  saveLookChanges,
  saveNewLook,
  saveScreenshot,
  saveSheet,
  saveTrigger,
  sheetNameInput,
  selectGroup,
  selectPiece,
  selectionPill,
  stageTransform,
  touchScrollGesture,
  type CanvasNode,
} from "./support/canvas";

const { linen, denim, tee, sneakers, tote } = ITEM_NAMES;

const transformOf = ({ itemId, x, y, width, height, rotation, zIndex }: ApiLookItem) => ({
  itemId,
  x,
  y,
  width,
  height,
  rotation,
  zIndex,
});

function expectSameNodes(actual: CanvasNode[], expected: CanvasNode[]) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((node, i) => {
    for (const key of ["x", "y", "width", "height", "rotation"] as const) {
      expect(node[key], `node ${i} ${key}`).toBeCloseTo(expected[i][key], 6);
    }
  });
}

test.describe("picker tap-to-add", () => {
  test("(a) each tap adds exactly one copy; Undo, the check badge and the selected piece's ✕ remove only one piece", async ({
    authedPage: page,
  }, testInfo) => {
    await openBuilder(page);
    // The old "Placed pieces" list is gone for good.
    await expect(page.getByRole("region", { name: "Placed pieces" })).toHaveCount(0);

    await addPiece(page, linen, 1);
    const badge = countBadge(page, linen);
    await expect(badge).toHaveAccessibleName(`Remove last ${linen} from canvas (1 on canvas)`);
    await expect(badge).toHaveText(""); // a lone check, no number at 1
    const [first] = await canvasNodes(page);

    // Second tap: a second copy, count 2.
    await addPiece(page, linen, 2);
    await expect(badge).toHaveAccessibleName(`Remove last ${linen} from canvas (2 on canvas)`);
    await expect(badge).toHaveText("2");
    const twoCopies = await canvasNodes(page);
    expect(twoCopies.some((n) => n.x !== first.x || n.y !== first.y), "second copy is placed apart from the first").toBe(true);

    // One Undo removes only the last placement.
    await page.getByRole("button", { name: "Undo" }).filter({ visible: true }).click();
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(1);
    await expect(badge).toHaveAccessibleName(`Remove last ${linen} from canvas (1 on canvas)`);
    expectSameNodes(await canvasNodes(page), [first]);

    // Interleave another item, then a fresh second copy; the check badge
    // removes only that most recent copy (the first copy and the jacket stay).
    await addPiece(page, denim, 2);
    const withJacket = await canvasNodes(page);
    await addPiece(page, linen, 3);
    await expect(badge).toHaveAccessibleName(`Remove last ${linen} from canvas (2 on canvas)`);
    await badge.click();
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(2);
    await expect(badge).toHaveAccessibleName(`Remove last ${linen} from canvas (1 on canvas)`);
    await expect(countBadge(page, denim)).toHaveAccessibleName(`Remove last ${denim} from canvas (1 on canvas)`);
    expectSameNodes(await canvasNodes(page), withJacket);

    // The selected piece's ✕ deletes just that piece; its tile loses the
    // check badge and the other piece stays where it was.
    await selectPiece(page, testInfo, 1);
    const cross = removeCross(page);
    await expect(cross).toHaveCount(1);
    const removed = (await cross.getAttribute("aria-label"))!.replace(/^Remove /, "");
    const kept = removed === linen ? denim : linen;
    expect([linen, denim]).toContain(removed);
    await cross.click();
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(1);
    await expect(countBadge(page, removed)).toHaveCount(0);
    await expect(countBadge(page, kept)).toHaveAccessibleName(`Remove last ${kept} from canvas (1 on canvas)`);
    // The tap selected the top piece (layer index 1), so the bottom one remains.
    expectSameNodes(await canvasNodes(page), [withJacket[0]]);
  });

  test("(b) group, subcategory and tag filters never change placed items; tags stay clearable while searching; search spans groups", async ({
    authedPage: page,
    closet,
  }) => {
    await openBuilder(page);
    await addPiece(page, linen, 1);
    await selectGroup(page, "Shoes");
    await addPiece(page, sneakers, 2);
    const nodes = await canvasNodes(page);

    const unchanged = async () => {
      expectSameNodes(await canvasNodes(page), nodes);
    };

    for (const group of ["Bags", "Accessories", "Clothes"] as const) {
      await selectGroup(page, group);
      await unchanged();
    }
    await expect(addTile(page, linen)).toBeVisible();
    await expect(addTile(page, sneakers)).toHaveCount(0);

    // Subcategory chips.
    const chip = (label: string) => picker(page).getByRole("button", { name: label, exact: true });
    await chip("Outerwear").click();
    await expect(addTile(page, denim)).toBeVisible();
    await expect(addTile(page, linen)).toHaveCount(0);
    await unchanged();
    await chip("Tops").click();
    await expect(addTile(page, linen)).toBeVisible();
    await expect(addTile(page, denim)).toHaveCount(0);
    await unchanged();
    await chip("All").click();
    await expect(countBadge(page, linen)).toHaveAccessibleName(`Remove last ${linen} from canvas (1 on canvas)`);

    // Tag chip.
    const linenTag = picker(page).getByRole("button", { name: `#${closet.tags.linen}` });
    await linenTag.click();
    await expect(linenTag).toHaveAttribute("aria-pressed", "true");
    await expect(addTile(page, linen)).toBeVisible();
    await expect(addTile(page, tee)).toHaveCount(0);
    await unchanged();

    // Searching keeps the selected tag visible and clearable.
    const search = picker(page).getByRole("searchbox", { name: "Search pieces" });
    await search.fill("sneak");
    await expect(picker(page).getByText("Showing results from all groups")).toBeVisible();
    await expect(linenTag).toBeVisible();
    await expect(linenTag).toHaveAttribute("aria-pressed", "true");
    // Sneakers aren't tagged linen, so nothing matches until the tag is cleared.
    await expect(addTile(page, sneakers)).toHaveCount(0);
    await linenTag.click();
    await expect(picker(page).getByRole("button", { name: `#${closet.tags.linen}`, pressed: true })).toHaveCount(0);
    // Search spans groups: the Clothes tab is active, yet the shoe is found.
    await expect(
      picker(page).getByRole("group", { name: "Stylebook group" }).getByRole("button", { name: "Clothes", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(addTile(page, sneakers)).toBeVisible();
    await search.fill("e");
    for (const name of [linen, denim, tee, sneakers, tote]) await expect(addTile(page, name)).toBeVisible();
    await unchanged();
  });
});

test.describe("fixed canvas", () => {
  /** Builder with two placed pieces, scrolled to the top, plus a checker that
   *  the page, stage and pieces are all exactly as they were. */
  async function twoPieceCanvas(page: Page) {
    await openBuilder(page);
    await addPiece(page, linen, 1);
    await addPiece(page, denim, 2);
    await page.evaluate(() => window.scrollTo(0, 0));
    const nodes = await canvasNodes(page);
    const stage = await stageTransform(page);
    const scrollY = await page.evaluate(() => window.scrollY);
    const zoom = await page.evaluate(() => window.visualViewport?.scale ?? 1);
    const still = async (label: string) => {
      expect(await page.evaluate(() => window.scrollY), `${label}: page did not scroll`).toBe(scrollY);
      expect(await page.evaluate(() => window.visualViewport?.scale ?? 1), `${label}: page did not zoom`).toBe(zoom);
      expect(await stageTransform(page), `${label}: stage did not pan`).toEqual(stage);
      expectSameNodes(await canvasNodes(page), nodes);
    };
    return { nodes, still };
  }

  test("(c) dragging on empty canvas (and a pinch on touch) neither pans the canvas nor scrolls the page", async ({
    authedPage: page,
  }, testInfo) => {
    const touch = Boolean(testInfo.project.use.hasTouch);
    const { still } = await twoPieceCanvas(page);
    // The builder fits the viewport (nothing below the panels to scroll to),
    // so make the document taller for this test: "did not scroll" is only
    // meaningful when the page *could* scroll.
    await page.evaluate(() => {
      const spacer = document.createElement("div");
      spacer.style.height = "1200px";
      document.body.appendChild(spacer);
    });
    expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true);

    const empty = await emptyCanvasPoint(page);
    await pointerDrag(page, testInfo, empty, { x: empty.x + 60, y: empty.y + 150 });
    await page.waitForTimeout(300);
    await still("drag down on empty canvas");
    await pointerDrag(page, testInfo, { x: empty.x + 60, y: empty.y + 150 }, empty);
    await page.waitForTimeout(300);
    await still("drag up on empty canvas");
    if (touch) {
      // Also as a real touch scroll gesture (what a finger flick produces).
      await touchScrollGesture(page, empty, -250);
      await page.waitForTimeout(300);
      await still("touch scroll gesture on empty canvas");
      await pinch(page, empty, 2);
      await page.waitForTimeout(300);
      await still("pinch on the canvas");

      // Controls: the same gestures off the canvas do act on the page, so the
      // assertions above are not vacuous.
      // Scroll control off the canvas (and off the picker, whose grid would
      // take the scroll): the page's own top bar.
      const title = (await page.getByRole("heading", { name: "Create a Look" }).filter({ visible: true }).boundingBox())!;
      const offCanvas = { x: title.x + title.width / 2, y: title.y + title.height / 2 };
      await touchScrollGesture(page, offCanvas, -250);
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => window.scrollY), "control: touch scroll off the canvas scrolls the page").toBeGreaterThan(0);
      // Pinch control on the picker panel (touch-action auto; the top bar is
      // too close to the viewport edge for the synthetic pinch's fingers).
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
      const panel = (await pickerPanel(page).boundingBox())!;
      await pinch(page, { x: panel.x + panel.width / 2, y: panel.y + panel.height / 2 }, 2);
      await page.waitForTimeout(300);
      const zoomed = await page.evaluate(() => window.visualViewport?.scale ?? 1);
      expect(zoomed, "control: the same pinch off the canvas zooms the page").toBeGreaterThan(1);
    }
  });

  // A wheel / trackpad scroll over the canvas is allowed to scroll the page
  // (the canvas deliberately has no wheel handler, so a short window can
  // still scroll), so window.scrollY is intentionally NOT asserted here. What
  // must hold is that the wheel never moves pieces or zooms/pans the canvas.
  test("(c) a wheel / two-finger trackpad scroll over the canvas moves no piece and does not zoom or pan the canvas", async ({
    authedPage: page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "wheel input is a desktop scenario");
    const { nodes } = await twoPieceCanvas(page);
    const stage = await stageTransform(page);
    const empty = await emptyCanvasPoint(page);
    await page.mouse.move(empty.x, empty.y);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(400);
    // Over a piece too, and back up again.
    const overPiece = await nodeScreenCenter(page, 0);
    await page.mouse.move(overPiece.x, overPiece.y);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(400);
    expect(await stageTransform(page), "stage scale and offset unchanged").toEqual(stage);
    expectSameNodes(await canvasNodes(page), nodes);
  });

  test("(c) dragging a piece moves only that piece and it cannot leave the 400x711 space, even rotated", async ({
    authedPage: page,
    userApi,
  }, testInfo) => {
    const { nodes } = await twoPieceCanvas(page);
    const area = (await page.getByTestId("outfit-canvas").boundingBox())!;
    const viewport = page.viewportSize()!;

    // Piece 0 to (beyond) the top-left corner.
    const from0 = await nodeScreenCenter(page, 0);
    await pointerDrag(page, testInfo, from0, { x: area.x + 2, y: area.y + 2 }, 16);
    await page.waitForTimeout(300);
    const afterFirst = await canvasNodes(page);
    expect(afterFirst[0].x).toBeCloseTo(0, 3);
    expect(afterFirst[0].y).toBeCloseTo(0, 3);
    expectSameNodes([afterFirst[1]], [nodes[1]]);

    // Rotate piece 1 with the Transformer's rotate handle (~45 degrees).
    const centre1 = await nodeScreenCenter(page, 1);
    // Select it with a tap/click.
    if (testInfo.project.use.hasTouch) await page.touchscreen.tap(centre1.x, centre1.y);
    else await page.mouse.click(centre1.x, centre1.y);
    await expect(selectionPill(page)).toBeVisible();
    const rotater = await rotaterPoint(page);
    const radius = Math.hypot(rotater.x - centre1.x, rotater.y - centre1.y);
    await pointerDrag(page, testInfo, rotater, { x: centre1.x + radius * Math.SQRT1_2, y: centre1.y - radius * Math.SQRT1_2 }, 16);
    await page.waitForTimeout(300);
    const rotated = await canvasNodes(page);
    expect(Math.abs(rotated[1].rotation), "piece 1 is rotated").toBeGreaterThan(20);
    expectSameNodes([rotated[0]], [afterFirst[0]]);

    // Piece 1 to (beyond) the bottom-right corner.
    const from1 = await nodeScreenCenter(page, 1);
    const farCorner = { x: area.x + area.width - 2, y: Math.min(area.y + area.height - 2, viewport.height - 2) };
    await pointerDrag(page, testInfo, from1, farCorner, 16);
    await page.waitForTimeout(300);
    const afterSecond = await canvasNodes(page);
    expectSameNodes([afterSecond[0]], [afterFirst[0]]);
    const box1 = rotatedBox(afterSecond[1]);
    expect(box1.right, "rotated piece pushed against the right edge").toBeCloseTo(DESIGN_WIDTH, 3);
    expect(box1.bottom).toBeLessThanOrEqual(DESIGN_HEIGHT + 1e-6);
    expect(afterSecond[1].y, "piece 1 moved down").toBeGreaterThan(nodes[1].y);

    // Persisted: every rotated bounding box lies inside 0..400 x 0..711.
    await saveNewLook(page, "Corner look");
    const [look] = await userApi.looks();
    const saved = await userApi.look(look.id);
    expect(saved.items).toHaveLength(2);
    expect(saved.items.some((i) => Math.abs(i.rotation) > 20)).toBe(true);
    for (const item of saved.items) {
      const box = rotatedBox(item);
      expect(box.left).toBeGreaterThanOrEqual(-1e-6);
      expect(box.top).toBeGreaterThanOrEqual(-1e-6);
      expect(box.right).toBeLessThanOrEqual(DESIGN_WIDTH + 1e-6);
      expect(box.bottom).toBeLessThanOrEqual(DESIGN_HEIGHT + 1e-6);
    }
  });

  test("(d) a saved three-piece look reopens with identical transforms and the detail page shows it unclipped", async ({
    authedPage: page,
    userApi,
  }, testInfo) => {
    await openBuilder(page);
    await addPiece(page, linen, 1);
    await addPiece(page, denim, 2);
    await selectGroup(page, "Bags");
    await addPiece(page, tote, 3);
    await saveNewLook(page, "Three Piece Look");

    const looks = await userApi.looks();
    expect(looks).toHaveLength(1);
    const before: ApiLook = await userApi.look(looks[0].id);
    expect(before.name).toBe("Three Piece Look");
    expect(before.items).toHaveLength(3);

    // Reopen in the editor: the canvas shows exactly the saved transforms.
    await openBuilder(page, `/stylebook/${before.id}/edit`);
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(3);
    const sorted = [...before.items].sort((a, b) => a.zIndex - b.zIndex);
    expectSameNodes(
      await canvasNodes(page),
      sorted.map((i) => ({ cls: "", fill: null, x: i.x, y: i.y, width: i.width, height: i.height, rotation: i.rotation })),
    );

    // Saving without changes round-trips every number exactly; the sheet
    // shows the saved name.
    await openSaveSheet(page);
    await expect(sheetNameInput(page)).toHaveValue("Three Piece Look");
    await saveSheet(page).getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/stylebook/${before.id}$`));
    const after = await userApi.look(before.id);
    expect(after.items.map(transformOf)).toEqual(before.items.map(transformOf));

    // Detail page: every piece is drawn fully inside the (on-screen) canvas.
    await expect(page.getByText("3 pieces").filter({ visible: true })).toBeVisible();
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(3);
    await expect.poll(async () => (await canvasNodes(page)).filter((n) => n.hasImage).length).toBe(3);
    expect(await boardInfo(page), "the read-only detail canvas draws no board frame").toBeNull();
    const { stage, container, rects } = await nodeClientRects(page);
    const viewport = page.viewportSize()!;
    expect(container.x).toBeGreaterThanOrEqual(0);
    expect(container.x + container.width).toBeLessThanOrEqual(viewport.width + 0.5);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(-0.5);
      expect(r.y).toBeGreaterThanOrEqual(-0.5);
      expect(r.x + r.width).toBeLessThanOrEqual(stage.width + 0.5);
      expect(r.y + r.height).toBeLessThanOrEqual(stage.height + 0.5);
    }
    await saveScreenshot(page, testInfo, "d-look-detail", { fullPage: true });
  });

  test("(l) layering survives save and reopen: a piece added later lands in its own zone, not above the saved ones", async ({
    authedPage: page,
    userApi,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "layering is viewport-independent; one project is enough");
    await openBuilder(page);
    await addPiece(page, denim, 1); // Clothes > Outerwear (zone rank 2)
    await addPiece(page, linen, 2); // Clothes > Tops (zone rank 1)
    await saveNewLook(page, "Layered Look");
    const [{ id }] = await userApi.looks();
    // Reopen, add a rank-0 piece (shoes), save again.
    await openBuilder(page, `/stylebook/${id}/edit`);
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(2);
    await selectGroup(page, "Shoes");
    await addPiece(page, sneakers, 3);
    await saveLookChanges(page, id);

    const after = await userApi.look(id);
    expect(after.items).toHaveLength(3);
    const z = (name: string) => after.items.find((i) => i.name === name)!.zIndex;
    expect(z(denim), "outerwear stays above the new shoes").toBeGreaterThan(z(sneakers));
    expect(z(linen), "top stays above the new shoes").toBeGreaterThan(z(sneakers));
    expect(z(denim), "outerwear stays above the top").toBeGreaterThan(z(linen));
  });

  test("(j) resizing the window never changes saved logical positions", async ({ authedPage: page, userApi }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "window resizing is a desktop scenario");
    await openBuilder(page);
    await addPiece(page, linen, 1);
    await addPiece(page, denim, 2);
    await selectGroup(page, "Shoes");
    await addPiece(page, sneakers, 3);
    const initial = await canvasNodes(page);

    for (const size of [
      { width: 1000, height: 700 },
      { width: 800, height: 600 },
      { width: 1700, height: 1050 },
    ]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(400);
      expectSameNodes(await canvasNodes(page), initial);
    }

    await saveNewLook(page, "Resize look");
    const [{ id }] = await userApi.looks();
    const first = await userApi.look(id);
    expectSameNodes(
      [...first.items].sort((a, b) => a.zIndex - b.zIndex).map((i) => ({ ...i, cls: "", fill: null })),
      initial,
    );

    // Reopen, resize smaller then larger, save again: identical numbers.
    await page.setViewportSize({ width: 1440, height: 900 });
    await openBuilder(page, `/stylebook/${id}/edit`);
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(3);
    await page.setViewportSize({ width: 900, height: 650 });
    await page.waitForTimeout(400);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.waitForTimeout(400);
    await saveLookChanges(page, id);
    const second = await userApi.look(id);
    expect(second.items.map(transformOf)).toEqual(first.items.map(transformOf));
  });
});

test.describe("canvas toolbar", () => {
  test("(k) after Copy, the Transformer resizes the copy and leaves the original untouched", async ({ authedPage: page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "mouse-driven Transformer handle drag");
    await openBuilder(page);
    await addPiece(page, linen, 1);
    await expect.poll(async () => (await canvasNodes(page))[0].hasImage).toBe(true);

    const centre = await nodeScreenCenter(page, 0);
    await page.mouse.click(centre.x, centre.y);
    const toolbar = selectionPill(page);
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole("button", { name: "Copy", exact: true }).click();
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(2);
    // Let the copy's image load: before the fix this swapped the copy's node
    // and left the Transformer on the destroyed one.
    await expect.poll(async () => (await canvasNodes(page))[1].hasImage).toBe(true);
    await page.waitForTimeout(200);
    const [original, copy] = await canvasNodes(page);
    expect(copy.x !== original.x || copy.y !== original.y, "the copy (top, last node) is offset from the original").toBe(true);

    // Drag the copy's top-left handle inward: the copy shrinks.
    const handle = await anchorPoint(page, "top-left");
    await mouseDrag(page, handle, { x: handle.x + 40, y: handle.y + 40 }, 10);
    await page.waitForTimeout(300);
    const after = await canvasNodes(page);
    expect(after).toHaveLength(2);
    expect(after[1].width, "copy was resized").toBeLessThan(copy.width - 5);
    expectSameNodes([after[0]], [original]);
  });
});

test.describe("docked layout", () => {
  type Box = { x: number; y: number; width: number; height: number };

  /** Checks the canvas + picker panels at the current viewport size and saves a screenshot. */
  async function checkLayout(page: Page, testInfo: import("@playwright/test").TestInfo, label: string, phone: boolean) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300); // let the ResizeObserver-driven stage settle
    const viewport = page.viewportSize()!;
    const canvas: Box = (await canvasPanel(page).boundingBox())!;
    const pick: Box = (await pickerPanel(page).boundingBox())!;
    const section: Box = (await picker(page).boundingBox())!;

    expect(boxesOverlap(canvas, pick), `${label}: canvas and picker panels do not overlap`).toBe(false);
    expect(boxesOverlap(canvas, section), `${label}: canvas and picker section do not overlap`).toBe(false);
    for (const [name, box] of [["canvas", canvas], ["picker", pick]] as const) {
      expect(box.x, `${label}: ${name} left edge inside the viewport`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${label}: ${name} right edge inside the viewport`).toBeLessThanOrEqual(viewport.width + 0.5);
      expect(box.height, `${label}: ${name} has a real height`).toBeGreaterThan(100);
    }
    // The section fills its docked slot.
    expect(section.height).toBeCloseTo(pick.height, 0);
    // No horizontal page scroll, and no vertical one either: with Save in the
    // top bar nothing sits below the panels.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${label}: page does not scroll horizontally`,
    ).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight),
      `${label}: page does not scroll vertically`,
    ).toBeLessThanOrEqual(0);
    // The top-bar Save is on screen without scrolling.
    await expect(saveTrigger(page), `${label}: top-bar Save visible`).toBeInViewport({ ratio: 1 });

    // Both panels are usable without scrolling the page: fully on screen
    // (on a phone, above the fixed bottom nav).
    const navTop = await page.evaluate(() => {
      const nav = [...document.querySelectorAll("nav")].find(
        (n) => getComputedStyle(n).position === "fixed" && getComputedStyle(n).display !== "none",
      );
      return nav ? nav.getBoundingClientRect().top : window.innerHeight;
    });
    expect(canvas.y, `${label}: canvas top on screen`).toBeGreaterThanOrEqual(0);
    expect(Math.max(canvas.y + canvas.height, pick.y + pick.height), `${label}: panels end above the bottom nav / viewport`).toBeLessThanOrEqual(navTop + 0.5);

    if (phone) {
      expect(pick.y, `${label}: picker is below the canvas`).toBeGreaterThanOrEqual(canvas.y + canvas.height);
      const ratio = canvas.height / pick.height;
      expect(ratio, `${label}: canvas/picker height ratio ~60/40`).toBeGreaterThanOrEqual(1.1);
      expect(ratio).toBeLessThanOrEqual(2.2);
    } else {
      expect(pick.x, `${label}: picker is right of the canvas`).toBeGreaterThanOrEqual(canvas.x + canvas.width);
      expect(canvas.height, `${label}: canvas panel is tall`).toBeGreaterThanOrEqual(400);
      expect(pick.height, `${label}: picker panel is tall`).toBeGreaterThanOrEqual(400);
      expect(pick.width, `${label}: picker panel is ~28rem wide`).toBeCloseTo(448, 0);
    }

    // The tile grid scrolls inside the picker panel (and the page does not).
    const scroller = pickerScroller(page);
    expect(await scroller.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
    const dims = await scroller.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    expect(dims.scrollHeight, `${label}: enough tiles to overflow the grid`).toBeGreaterThan(dims.clientHeight);
    const scrolled = await scroller.evaluate((el) => {
      el.scrollTop = 120;
      return el.scrollTop;
    });
    expect(scrolled, `${label}: grid scrolled inside its panel`).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY), `${label}: page did not scroll`).toBe(0);
    await scroller.evaluate((el) => {
      el.scrollTop = 0;
    });

    // The canvas draws the framed 400x711 board, fully inside the canvas panel.
    const board = (await boardInfo(page))!;
    expect(board, `${label}: board frame is drawn`).not.toBeNull();
    expect({ x: board.x, y: board.y, width: board.width, height: board.height }).toEqual({
      x: 0,
      y: 0,
      width: DESIGN_WIDTH,
      height: DESIGN_HEIGHT,
    });
    expect(board.listening, "board does not catch taps").toBe(false);
    expect(board.zIndex, "board is beneath every piece").toBe(0);
    expect(board.client.x).toBeGreaterThanOrEqual(-0.5);
    expect(board.client.y).toBeGreaterThanOrEqual(-0.5);
    expect(board.client.x + board.client.width).toBeLessThanOrEqual(board.stage.width + 0.5);
    expect(board.client.y + board.client.height).toBeLessThanOrEqual(board.stage.height + 0.5);
    // ...and the board touches the panel on at least one axis (letterboxed fit).
    expect(
      Math.abs(board.client.width - board.stage.width) < 1 || Math.abs(board.client.height - board.stage.height) < 1,
      `${label}: board is fitted to the panel`,
    ).toBe(true);

    await saveScreenshot(page, testInfo, `e-layout-${label}`);
  }

  test("(e) canvas and picker are docked side by side (desktop) or stacked (phone), never overlapping; the grid scrolls inside the picker", async ({
    authedPage: page,
    userApi,
  }, testInfo) => {
    // Enough extra Clothes tiles that the grid must scroll (photo-less, so no image loads).
    for (let i = 1; i <= 20; i++) {
      await userApi.createItem({ name: `Spare Top ${String(i).padStart(2, "0")}`, category: "Clothes", subcategory: "Tops" });
    }
    const phone = testInfo.project.name === "mobile";
    await openBuilder(page);
    await expect(addTile(page, "Spare Top 20")).toBeAttached();
    await addPiece(page, linen, 1);
    await addPiece(page, denim, 2);

    // The removed sheet left nothing behind.
    await expect(page.getByRole("button", { name: /^Resize picker/ })).toHaveCount(0);

    if (phone) {
      await checkLayout(page, testInfo, "phone-390x844", true);
      await selectPiece(page, testInfo, 1);
      await saveScreenshot(page, testInfo, "e-layout-phone-selected");
      // Short phone.
      await page.setViewportSize({ width: 375, height: 667 });
      await checkLayout(page, testInfo, "phone-375x667", true);
    } else {
      await checkLayout(page, testInfo, "desktop-1440x900", false);
      await selectPiece(page, testInfo, 1);
      await saveScreenshot(page, testInfo, "e-layout-desktop-selected");
    }

    // New pieces are placed against the whole 400x711 board.
    for (const node of await canvasNodes(page)) {
      const box = rotatedBox(node);
      expect(box.left).toBeGreaterThanOrEqual(-1e-6);
      expect(box.top).toBeGreaterThanOrEqual(-1e-6);
      expect(box.right).toBeLessThanOrEqual(DESIGN_WIDTH + 1e-6);
      expect(box.bottom).toBeLessThanOrEqual(DESIGN_HEIGHT + 1e-6);
    }

  });

  test("(e) the top-bar Save is visible without scrolling and its sheet fits the viewport with the primary button reachable", async ({
    authedPage: page,
  }, testInfo) => {
    const sizes =
      testInfo.project.name === "mobile"
        ? [
            { width: 390, height: 844, shot: "save-sheet-phone-390x844" },
            { width: 375, height: 667, shot: "save-sheet-phone-375x667" },
          ]
        : [{ width: 1440, height: 900, shot: "save-sheet-desktop-1440x900" }];
    await openBuilder(page);
    await addPiece(page, linen, 1);
    await addPiece(page, denim, 2);

    for (const { width, height, shot } of sizes) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      const label = `${width}x${height}`;
      expect(await page.evaluate(() => window.scrollY), `${label}: at the top`).toBe(0);
      await expect(saveTrigger(page), `${label}: Save fully on screen`).toBeInViewport({ ratio: 1 });
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight),
        `${label}: page does not scroll vertically`,
      ).toBeLessThanOrEqual(0);
      // The Save pill leaves room for the whole page title (no ellipsis).
      const title = page.getByRole("heading", { name: "Create a Look" }).filter({ visible: true });
      expect(await title.evaluate((el) => el.scrollWidth - el.clientWidth), `${label}: title not truncated`).toBeLessThanOrEqual(0);
      await saveScreenshot(page, testInfo, `builder-topbar-${label}`);

      const sheet = await openSaveSheet(page);
      const box = (await sheet.boundingBox())!;
      expect(box.y, `${label}: sheet top on screen`).toBeGreaterThanOrEqual(-0.5);
      expect(box.x).toBeGreaterThanOrEqual(-0.5);
      expect(box.x + box.width, `${label}: sheet fits horizontally`).toBeLessThanOrEqual(width + 0.5);
      expect(box.y + box.height, `${label}: sheet fits vertically`).toBeLessThanOrEqual(height + 0.5);
      const primary = sheet.getByRole("button", { name: "Save look", exact: true });
      await expect(primary, `${label}: primary button reachable`).toBeInViewport({ ratio: 1 });
      // Nothing else (e.g. the bottom nav) covers the primary button.
      const centre = (await primary.boundingBox())!;
      expect(
        await page.evaluate(
          ([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.textContent ?? null,
          [centre.x + centre.width / 2, centre.y + centre.height / 2] as const,
        ),
        `${label}: primary button is the topmost element at its centre`,
      ).toBe("Save look");
      expect(await page.evaluate(() => document.body.style.overflow), `${label}: body scroll locked`).toBe("hidden");
      await saveScreenshot(page, testInfo, shot);
      await page.keyboard.press("Escape");
      await expect(saveSheet(page)).toHaveCount(0);
    }
  });
});

test.describe("photo-less items and hidden categories", () => {
  test("(f) an item without a photo shows the fallback tile and canvas tile, and never hits the upload route", async ({
    authedPage: page,
    closet,
  }) => {
    const requests: { method: string; url: string }[] = [];
    page.on("request", (r) => requests.push({ method: r.method(), url: r.url() }));
    await openBuilder(page);

    const teeId = closet.items[tee].id;
    const tile = addTile(page, tee);
    await expect(tile).toBeVisible();
    await expect(tile.locator("img")).toHaveCount(0);
    await expect(tile.locator("svg")).toHaveCount(1);
    // A photo tile for comparison does render an <img>.
    await expect(addTile(page, linen).locator("img")).toHaveCount(1);

    const before = requests.length;
    await addPiece(page, tee, 1);
    await page.waitForTimeout(2000); // give any (wrongly) queued cutout job time to start
    const nodes = await canvasNodes(page);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].hasImage, "photo-less piece has no picture").toBe(false);
    expect(nodes[0].fill, "photo-less piece is drawn as a filled tile").toBeTruthy();

    const after = requests.slice(before);
    const path = (u: string) => new URL(u).pathname;
    expect(after.filter((r) => path(r.url) === "/api/uploads"), "no upload after placing").toEqual([]);
    expect(after.filter((r) => path(r.url).startsWith("/uploads/")), "no photo fetch after placing").toEqual([]);
    expect(after.filter((r) => path(r.url) === `/api/inventory/${teeId}`), "no cutout backfill").toEqual([]);
    // Over the whole session, the only photo ever requested is the seeded one.
    for (const r of requests.filter((x) => path(x.url).startsWith("/uploads/"))) {
      expect(path(r.url)).toBe(closet.photoURL);
    }
    expect(requests.filter((r) => path(r.url) === "/api/uploads")).toEqual([]);
  });

  test("(g) with every category hidden the picker explains it; un-hiding one brings tiles back", async ({ authedPage: page, userApi }) => {
    for (const category of await userApi.categories()) {
      const updated = await userApi.putCategory(category.id, { name: category.name, stylebookGroup: "" });
      expect(updated.stylebookGroup).toBeNull();
    }
    await openBuilder(page);
    await expect(picker(page).getByText("No categories are set up for Stylebook yet")).toBeVisible();
    await expect(picker(page).getByRole("button", { name: /^Add / })).toHaveCount(0);

    const clothes = await userApi.category("Clothes");
    expect((await userApi.putCategory(clothes.id, { name: "Clothes", stylebookGroup: "clothes" })).stylebookGroup).toBe("clothes");
    await page.reload();
    await expect(addTile(page, linen)).toBeVisible();
    await expect(addTile(page, denim)).toBeVisible();
    await expect(picker(page).getByText("No categories are set up for Stylebook yet")).toHaveCount(0);
    // Shoes are still hidden.
    await selectGroup(page, "Shoes");
    await expect(addTile(page, sneakers)).toHaveCount(0);
  });
});

test.describe("category form", () => {
  test("(h) Stylebook group select: Hidden persists, rename keeps the group, Automatic resolves from the name", async ({
    authedPage: page,
    userApi,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the Edit Categories entry point is desktop-only (hidden below sm)");
    await page.goto("/categories");
    await page.getByRole("button", { name: "Edit Categories" }).click();
    const groupSelect = page.getByLabel("Stylebook group");
    const nameInput = page.getByLabel("Category Name");

    // Shoes (default group "shoes") -> Hidden.
    await page.getByRole("button", { name: "Edit Shoes" }).click();
    await expect(groupSelect).toHaveValue("shoes");
    await groupSelect.selectOption("hidden");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(groupSelect).toHaveCount(0);
    expect((await userApi.category("Shoes")).stylebookGroup).toBeNull();

    // Reopen: shows Hidden.
    await page.getByRole("button", { name: "Edit Shoes" }).click();
    await expect(groupSelect).toHaveValue("hidden");
    await expect(groupSelect.locator("option:checked")).toHaveText("Hidden from Stylebook");

    // Rename to a name whose automatic group would be "shoes", without
    // touching the select: the stored (hidden) group must not change.
    await nameInput.fill("Footwear");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(groupSelect).toHaveCount(0);
    const footwear = await userApi.category("Footwear");
    expect(footwear.stylebookGroup).toBeNull();

    // Renaming a grouped category keeps its group too.
    await page.getByRole("button", { name: "Edit Bags" }).click();
    await expect(groupSelect).toHaveValue("bags");
    await nameInput.fill("Purses");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(groupSelect).toHaveCount(0);
    expect((await userApi.category("Purses")).stylebookGroup).toBe("bags");

    // New category, left on Automatic.
    await page.getByLabel("Edit Categories").getByRole("button", { name: "Add Category" }).click();
    await expect(groupSelect).toHaveValue("auto");
    await expect(groupSelect.locator("option:checked")).toHaveText("Automatic (based on name)");
    await nameInput.fill("Accessories");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(groupSelect).toHaveCount(0);
    expect((await userApi.category("Accessories")).stylebookGroup).toBe("accessories");
  });
});
