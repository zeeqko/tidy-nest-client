// End-to-end tests for the Stylebook Outfit Builder: picker tap-to-add and
// filters, the fixed (non-panning) canvas, save/reopen, the mobile sheet
// snaps, photo-less items, hidden categories, the category form's Stylebook
// group, and window resizing. Runs in the desktop (1440x900, mouse) and
// mobile (390x844, touch) projects; viewport-specific tests skip themselves.
import type { Page } from "@playwright/test";
import { test, expect, ITEM_NAMES, type ApiLook, type ApiLookItem } from "./fixtures";
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  addPiece,
  addTile,
  canvasNodes,
  countBadge,
  emptyCanvasPoint,
  nodeClientRects,
  nodeScreenCenter,
  openBuilder,
  picker,
  pickerHandle,
  pinch,
  placedNames,
  placedRegion,
  pointerDrag,
  rotatedBox,
  rotaterPoint,
  saveNewLook,
  saveScreenshot,
  selectGroup,
  stageTransform,
  touchDrag,
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
  test("(a) each tap adds exactly one copy; Undo and the check badge remove only the last copy", async ({ authedPage: page }) => {
    await openBuilder(page);

    await addPiece(page, linen, 1);
    expect(await placedNames(page)).toEqual([linen]);
    await expect(placedRegion(page).getByText("1 piece", { exact: true })).toBeVisible();
    const badge = countBadge(page, linen);
    await expect(badge).toHaveAccessibleName(`Remove last ${linen} from canvas (1 on canvas)`);
    await expect(badge).toHaveText(""); // a lone check, no number at 1
    const [first] = await canvasNodes(page);

    // Second tap: a second copy, count 2.
    await addPiece(page, linen, 2);
    expect(await placedNames(page)).toEqual([linen, linen]);
    await expect(badge).toHaveAccessibleName(`Remove last ${linen} from canvas (2 on canvas)`);
    await expect(badge).toHaveText("2");
    const twoCopies = await canvasNodes(page);
    expect(twoCopies.some((n) => n.x !== first.x || n.y !== first.y), "second copy is placed apart from the first").toBe(true);

    // One Undo removes only the last placement.
    await page.getByRole("button", { name: "Undo" }).filter({ visible: true }).click();
    await expect(placedRegion(page).getByRole("listitem")).toHaveCount(1);
    await expect(badge).toHaveAccessibleName(`Remove last ${linen} from canvas (1 on canvas)`);
    expectSameNodes(await canvasNodes(page), [first]);

    // Interleave another item, then a fresh second copy; the check badge
    // removes only that most recent copy (the first copy and the jacket stay).
    await addPiece(page, denim, 2);
    const withJacket = await canvasNodes(page);
    await addPiece(page, linen, 3);
    await expect(badge).toHaveAccessibleName(`Remove last ${linen} from canvas (2 on canvas)`);
    await badge.click();
    await expect(placedRegion(page).getByRole("listitem")).toHaveCount(2);
    expect(await placedNames(page)).toEqual([linen, denim]);
    await expect(badge).toHaveAccessibleName(`Remove last ${linen} from canvas (1 on canvas)`);
    expectSameNodes(await canvasNodes(page), withJacket);
  });

  test("(b) group, subcategory and tag filters never change placed items; tags stay clearable while searching; search spans groups", async ({
    authedPage: page,
    closet,
  }) => {
    await openBuilder(page);
    await addPiece(page, linen, 1);
    await selectGroup(page, "Shoes");
    await addPiece(page, sneakers, 2);
    const names = await placedNames(page);
    const nodes = await canvasNodes(page);

    const unchanged = async () => {
      expect(await placedNames(page)).toEqual(names);
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
    // The page itself is scrollable here, so "did not scroll" is meaningful.
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
      const below = (await placedRegion(page).boundingBox())!;
      const offCanvas = { x: page.viewportSize()!.width / 2, y: Math.min(below.y + 20, page.viewportSize()!.height - 120) };
      await touchScrollGesture(page, offCanvas, -250);
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => window.scrollY), "control: touch scroll off the canvas scrolls the page").toBeGreaterThan(0);
      await pinch(page, offCanvas, 2);
      await page.waitForTimeout(300);
      const zoomed = await page.evaluate(() => window.visualViewport?.scale ?? 1);
      expect(zoomed, "control: the same pinch off the canvas zooms the page").toBeGreaterThan(1);
    }
  });

  // A wheel / trackpad scroll over the canvas is allowed to scroll the page
  // (the canvas deliberately has no wheel handler, so desktop users can still
  // reach Save), so window.scrollY is intentionally NOT asserted here. What
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
    await expect(page.getByRole("toolbar", { name: /actions$/ })).toBeVisible();
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
    await expect(page.getByPlaceholder("Name your look")).toHaveValue("Three Piece Look");
    await expect(placedRegion(page).getByRole("listitem")).toHaveCount(3);
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(3);
    const sorted = [...before.items].sort((a, b) => a.zIndex - b.zIndex);
    expectSameNodes(
      await canvasNodes(page),
      sorted.map((i) => ({ cls: "", fill: null, x: i.x, y: i.y, width: i.width, height: i.height, rotation: i.rotation })),
    );

    // Saving without changes round-trips every number exactly.
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page).toHaveURL(new RegExp(`/stylebook/${before.id}$`));
    const after = await userApi.look(before.id);
    expect(after.items.map(transformOf)).toEqual(before.items.map(transformOf));

    // Detail page: every piece is drawn fully inside the (on-screen) canvas.
    await expect(page.getByText("3 pieces").filter({ visible: true })).toBeVisible();
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(3);
    await expect.poll(async () => (await canvasNodes(page)).filter((n) => n.cls === "Image").length).toBe(3);
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
    await expect(placedRegion(page).getByRole("listitem")).toHaveCount(3);
    await page.setViewportSize({ width: 900, height: 650 });
    await page.waitForTimeout(400);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page).toHaveURL(new RegExp(`/stylebook/${id}$`));
    const second = await userApi.look(id);
    expect(second.items.map(transformOf)).toEqual(first.items.map(transformOf));
  });
});

test.describe("picker sheet layout", () => {
  test("(e) canvas fills the width; the drag handle stays inside viewport and container at every snap; Save is reachable", async ({
    authedPage: page,
  }, testInfo) => {
    const mobile = testInfo.project.name === "mobile";
    await openBuilder(page);
    await addPiece(page, linen, 1);
    await addPiece(page, tee, 2);
    await page.evaluate(() => window.scrollTo(0, 0));
    const viewport = page.viewportSize()!;

    const area = (await page.getByTestId("builder-canvas-area").boundingBox())!;
    const canvas = (await page.getByTestId("outfit-canvas").boundingBox())!;
    if (mobile) {
      // Page gutters are px-5 (20px) on mobile; the canvas box spans the rest.
      expect(area.x).toBeCloseTo(20, 0);
      expect(area.width).toBeCloseTo(viewport.width - 40, 0);
    }
    expect(canvas.width).toBeGreaterThanOrEqual(area.width - 2); // only the 1px border each side
    const stage = await stageTransform(page);
    expect(stage.width).toBeCloseTo(canvas.width, 0);

    const handle = pickerHandle(page);
    const checkHandle = async (snap: string) => {
      await expect(handle).toHaveAccessibleName(`Resize picker (currently ${snap})`);
      await page.waitForTimeout(300); // let the height transition settle
      const box = (await handle.boundingBox())!;
      const container = (await page.getByTestId("builder-canvas-area").boundingBox())!;
      expect(box.y, `${snap}: handle top inside viewport`).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, `${snap}: handle bottom inside viewport`).toBeLessThanOrEqual(viewport.height);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y, `${snap}: handle top inside container`).toBeGreaterThanOrEqual(container.y);
      expect(box.y + box.height, `${snap}: handle bottom inside container`).toBeLessThanOrEqual(container.y + container.height);
      // Nothing else is painted over the handle's centre.
      const hit = await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label") ?? null,
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      );
      expect(hit, `${snap}: handle is the topmost element at its centre`).toMatch(/^Resize picker/);
      return box;
    };

    await checkHandle("half");
    await saveScreenshot(page, testInfo, "e-sheet-half");

    // Drag the handle all the way up: full.
    let box = (await handle.boundingBox())!;
    await pointerDrag(page, testInfo, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, { x: box.x + box.width / 2, y: area.y + 4 }, 14);
    await checkHandle("full");
    await saveScreenshot(page, testInfo, "e-sheet-full");

    // And all the way down: peek.
    box = (await handle.boundingBox())!;
    await pointerDrag(
      page,
      testInfo,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      { x: box.x + box.width / 2, y: area.y + area.height + 40 },
      14,
    );
    await checkHandle("peek");
    await saveScreenshot(page, testInfo, "e-sheet-peek");

    // A tap from peek opens to half again.
    box = (await handle.boundingBox())!;
    if (testInfo.project.use.hasTouch) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    else await handle.click();
    await checkHandle("half");

    // The Save footer is reachable by scrolling the page with a finger.
    const save = page.getByRole("button", { name: "Save to Style Book" });
    if (mobile) {
      const below = (await placedRegion(page).boundingBox())!;
      const start = { x: viewport.width / 2, y: Math.min(below.y + 20, viewport.height - 120) };
      for (let i = 0; i < 4 && !(await isFullyAboveNav(page, save)); i++) {
        await touchDrag(page, start, { x: start.x, y: start.y - 400 }, 16);
        await page.waitForTimeout(400);
      }
      expect(await page.evaluate(() => window.scrollY), "page scrolled by touch").toBeGreaterThan(0);
      expect(await isFullyAboveNav(page, save), "Save button visible above the bottom nav").toBe(true);
      await saveScreenshot(page, testInfo, "e-save-footer");
    } else {
      await save.scrollIntoViewIfNeeded();
      await expect(save).toBeInViewport();
    }
  });
});

/** True when `target` is fully inside the viewport and not under the fixed bottom nav. */
async function isFullyAboveNav(page: import("@playwright/test").Page, target: import("@playwright/test").Locator) {
  const box = await target.boundingBox();
  if (!box) return false;
  const navTop = await page.evaluate(() => {
    const nav = [...document.querySelectorAll("nav")].find((n) => getComputedStyle(n).position === "fixed");
    return nav ? nav.getBoundingClientRect().top : window.innerHeight;
  });
  return box.y >= 0 && box.y + box.height <= navTop;
}

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
    expect(nodes[0].cls, "photo-less piece is drawn as a filled tile, not an image").toBe("Rect");
    expect(nodes[0].fill).toBeTruthy();

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
