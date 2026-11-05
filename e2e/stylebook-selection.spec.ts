// End-to-end tests for the builder's selection controls: the red ✕ on the
// selected piece's top-right corner (remove), the dark pill with send to
// back / bring to front / copy, and the desktop Delete / Backspace shortcut.
// Runs in the desktop (1440x900, mouse) and mobile (390x844, touch)
// projects; viewport-specific tests skip themselves.
import type { Page, TestInfo } from "@playwright/test";
import { test, expect, ITEM_NAMES } from "./fixtures";
import {
  addPiece,
  boardInfo,
  boxesOverlap,
  canvasNodes,
  countBadge,
  nodeScreenCenter,
  nodeScreenRect,
  openBuilder,
  outfitCanvas,
  picker,
  pointerDrag,
  removeCross,
  saveNewLook,
  saveScreenshot,
  selectPiece,
  selectionPill,
  type CanvasNode,
  type Point,
} from "./support/canvas";

const { linen, denim, tee } = ITEM_NAMES;

/** Geometry-only comparison of placed nodes (layer order). */
function expectSameNodes(actual: CanvasNode[], expected: CanvasNode[]) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((node, i) => {
    for (const key of ["x", "y", "width", "height", "rotation"] as const) {
      expect(node[key], `node ${i} ${key}`).toBeCloseTo(expected[i][key], 6);
    }
  });
}

/** Sum of geometry differences between two nodes (0 when they match). */
const geometryDiff = (a: CanvasNode, b: CanvasNode) =>
  (["x", "y", "width", "height", "rotation"] as const).reduce((sum, key) => sum + Math.abs(a[key] - b[key]), 0);

/** The ✕ is centred this far (px) right of and above the piece's corner
 *  (the 22px circle's radius), so it mostly sits outside the piece. */
const CROSS_OUTSET = 11;

/** Distance (px) between the ✕'s box centre and where it belongs when not
 *  clamped: (corner.x + 11, corner.y - 11), the corner being the top-right of
 *  the rotated bounding box of the node at `nodeIndex`. */
async function crossDistanceFromCorner(page: Page, nodeIndex: number) {
  const box = await removeCross(page).boundingBox();
  if (!box) return Number.POSITIVE_INFINITY;
  const r = await nodeScreenRect(page, nodeIndex);
  return Math.hypot(
    box.x + box.width / 2 - (r.x + r.width + CROSS_OUTSET),
    box.y + box.height / 2 - (r.y - CROSS_OUTSET),
  );
}

async function expectCrossOnCorner(page: Page, nodeIndex: number, label: string) {
  await expect
    .poll(() => crossDistanceFromCorner(page, nodeIndex), {
      message: `${label}: ✕ sits just outside the piece's top-right corner`,
    })
    .toBeLessThan(1.5);
}

/** Drags the top piece (last in layer order) to the middle of the canvas,
 *  which also selects it, away from every edge so its ✕ is not clamped. */
async function dragTopPieceToMiddle(page: Page, testInfo: TestInfo) {
  const nodes = await canvasNodes(page);
  const top = nodes.length - 1;
  const area = (await outfitCanvas(page).boundingBox())!;
  const from = await nodeScreenCenter(page, top);
  const to = { x: area.x + area.width / 2, y: area.y + area.height * 0.45 };
  await pointerDrag(page, testInfo, from, to, 12);
  await expect(removeCross(page)).toBeVisible();
  return top;
}

/** Starts a drag (pointer held down) of the node at `nodeIndex`, moves it by
 *  `delta`, and returns a function that releases it. */
async function holdDrag(page: Page, testInfo: TestInfo, nodeIndex: number, delta: Point) {
  const from = await nodeScreenCenter(page, nodeIndex);
  const to = { x: from.x + delta.x, y: from.y + delta.y };
  if (testInfo.project.use.hasTouch) {
    const cdp = await page.context().newCDPSession(page);
    const touch = (p: Point) => [{ x: p.x, y: p.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touch(from) });
    for (let i = 1; i <= 10; i++) {
      const p = { x: from.x + (delta.x * i) / 10, y: from.y + (delta.y * i) / 10 };
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touch(p) });
      await page.waitForTimeout(16);
    }
    return async () => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await cdp.detach();
    };
  }
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  return async () => {
    await page.mouse.up();
  };
}

test.describe("selection ✕ and pill", () => {
  test("(a) no ✕ or pill without a selection; the ✕ sits on the selected piece's top-right corner and removes only that piece", async ({
    authedPage: page,
  }, testInfo) => {
    await openBuilder(page);
    await addPiece(page, linen, 1);
    await addPiece(page, denim, 2);
    await addPiece(page, tee, 3);

    // Nothing selected yet (adding does not select).
    await expect(removeCross(page)).toHaveCount(0);
    await expect(selectionPill(page)).toHaveCount(0);

    const top = await dragTopPieceToMiddle(page, testInfo);
    await expectCrossOnCorner(page, top, "after selecting by drag");
    const cross = removeCross(page);
    await expect(cross).toHaveCount(1);
    const box = (await cross.boundingBox())!;
    expect(box.width, "✕ hit area is at least 44px wide").toBeGreaterThanOrEqual(44);
    expect(box.height, "✕ hit area is at least 44px tall").toBeGreaterThanOrEqual(44);
    // The ✕ and the pill never overlap.
    expect(boxesOverlap(box, (await selectionPill(page).boundingBox())!)).toBe(false);
    // Only ~11px of the hit area reaches into the piece on each axis.
    const pieceRect = await nodeScreenRect(page, top);
    expect(pieceRect.x + pieceRect.width - box.x, "hit area's overlap with the piece (x)").toBeLessThanOrEqual(11.5);
    expect(box.y + box.height - pieceRect.y, "hit area's overlap with the piece (y)").toBeLessThanOrEqual(11.5);
    await saveScreenshot(page, testInfo, "rb-a-selected");
    await saveScreenshot(page, testInfo, "rb-a-selected-canvas", { target: outfitCanvas(page) });

    const removed = (await cross.getAttribute("aria-label"))!.replace(/^Remove /, "");
    expect([linen, denim, tee]).toContain(removed);
    const before = await canvasNodes(page);
    await cross.click();
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(2);
    expectSameNodes(await canvasNodes(page), before.slice(0, 2));
    await expect(countBadge(page, removed)).toHaveCount(0);
    for (const name of [linen, denim, tee].filter((n) => n !== removed)) {
      await expect(countBadge(page, name)).toHaveAccessibleName(`Remove last ${name} from canvas (1 on canvas)`);
    }
    // The removed piece took its selection with it.
    await expect(removeCross(page)).toHaveCount(0);
    await expect(selectionPill(page)).toHaveCount(0);
  });

  test("(b) the pill has exactly send to back, bring to front and copy, and each still works", async ({
    authedPage: page,
  }, testInfo) => {
    await openBuilder(page);
    await addPiece(page, linen, 1);
    await addPiece(page, denim, 2);

    const pill = await selectPiece(page, testInfo, 1);
    const buttons = pill.getByRole("button");
    await expect(buttons).toHaveCount(3);
    expect(await buttons.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")))).toEqual([
      "Send to back",
      "Bring to front",
      "Copy",
    ]);
    await expect(pill.getByRole("button", { name: /Remove/ })).toHaveCount(0);
    // No piece-name text in the pill.
    await expect(pill).toHaveText("");
    // Fully inside the canvas.
    const area = (await outfitCanvas(page).boundingBox())!;
    const pillBox = (await pill.boundingBox())!;
    expect(pillBox.x).toBeGreaterThanOrEqual(area.x);
    expect(pillBox.x + pillBox.width).toBeLessThanOrEqual(area.x + area.width + 0.5);
    expect(pillBox.y + pillBox.height).toBeLessThanOrEqual(area.y + area.height + 0.5);
    if (testInfo.project.use.hasTouch) {
      for (const b of await buttons.all()) {
        const bb = (await b.boundingBox())!;
        expect(bb.width, "touch target width").toBeGreaterThanOrEqual(44);
        expect(bb.height, "touch target height").toBeGreaterThanOrEqual(44);
      }
    }

    const selectedName = (await removeCross(page).getAttribute("aria-label"))!.replace(/^Remove /, "");
    const [bottom, topNode] = await canvasNodes(page);

    // Send to back: the selected (top) piece becomes the first in layer order.
    await pill.getByRole("button", { name: "Send to back" }).click();
    await expect.poll(async () => geometryDiff((await canvasNodes(page))[0], topNode)).toBeLessThan(1e-6);
    expectSameNodes(await canvasNodes(page), [topNode, bottom]);
    // Bring to front: back on top.
    await pill.getByRole("button", { name: "Bring to front" }).click();
    await expect.poll(async () => geometryDiff((await canvasNodes(page))[1], topNode)).toBeLessThan(1e-6);
    expectSameNodes(await canvasNodes(page), [bottom, topNode]);

    // Copy: one more piece of the same item, on top and selected.
    await pill.getByRole("button", { name: "Copy", exact: true }).click();
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(3);
    await expect(countBadge(page, selectedName)).toHaveAccessibleName(
      `Remove last ${selectedName} from canvas (2 on canvas)`,
    );
    await expectCrossOnCorner(page, 2, "on the selected copy");
  });

  test("(c) a piece dragged into the board's top-right corner still has its ✕ fully inside the canvas", async ({
    authedPage: page,
  }, testInfo) => {
    await openBuilder(page);
    await addPiece(page, linen, 1);
    await addPiece(page, denim, 2);

    const area = (await outfitCanvas(page).boundingBox())!;
    const board = (await boardInfo(page))!;
    const boardTopRight = { x: area.x + board.client.x + board.client.width, y: area.y + board.client.y };
    const from = await nodeScreenCenter(page, 1);
    // Aim beyond the corner: the piece is clamped against it.
    await pointerDrag(page, testInfo, from, { x: boardTopRight.x - 2, y: boardTopRight.y + 2 }, 16);
    const cross = removeCross(page);
    await expect(cross).toBeVisible();
    await page.waitForTimeout(200);

    const piece = await nodeScreenRect(page, 1);
    expect(piece.x + piece.width, "piece is against the board's right edge").toBeCloseTo(boardTopRight.x, 0);
    expect(piece.y, "piece is against the board's top edge").toBeCloseTo(boardTopRight.y, 0);

    const box = (await cross.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(area.x - 0.5);
    expect(box.y).toBeGreaterThanOrEqual(area.y - 0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height + 0.5);
    // Still at that corner: within half its size of it (clamping only pulls
    // it in from the unclamped corner + 11 / corner - 11 spot).
    expect(Math.abs(box.x + box.width / 2 - boardTopRight.x)).toBeLessThanOrEqual(box.width / 2 + 0.5);
    expect(Math.abs(box.y + box.height / 2 - boardTopRight.y)).toBeLessThanOrEqual(box.height / 2 + 0.5);
    await saveScreenshot(page, testInfo, "rb-c-corner", { target: outfitCanvas(page) });

    // And it works there.
    await cross.click();
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(1);
  });

  test("(d) phone: tapping the ✕ with a finger removes the piece; its hit area is at least 44x44", async ({
    authedPage: page,
  }, testInfo) => {
    test.skip(!testInfo.project.use.hasTouch, "touch scenario");
    await openBuilder(page);
    await addPiece(page, linen, 1);
    await addPiece(page, denim, 2);
    await selectPiece(page, testInfo, 1);
    const cross = removeCross(page);
    await expect(cross).toBeVisible();
    const box = (await cross.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await saveScreenshot(page, testInfo, "rb-d-phone-selected");

    // Tap near the edge of the hit area, outside the 22px visual circle.
    await page.touchscreen.tap(box.x + 4, box.y + box.height / 2);
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(1);
    await expect(removeCross(page)).toHaveCount(0);
    await expect(selectionPill(page)).toHaveCount(0);
  });

  test("(e) desktop: Delete removes the selected piece, but Backspace / Delete typed in the picker search box does not", async ({
    authedPage: page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "keyboard shortcut is a desktop scenario");
    await openBuilder(page);
    await addPiece(page, linen, 1);
    await addPiece(page, denim, 2);
    await addPiece(page, tee, 3);

    // Delete with a piece selected (focus on the page) removes it.
    await selectPiece(page, testInfo, 2);
    await page.keyboard.press("Delete");
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(2);
    await expect(removeCross(page)).toHaveCount(0);

    // A modifier held: nothing happens.
    await selectPiece(page, testInfo, 1);
    await page.keyboard.press("Control+Backspace");
    await page.keyboard.press("Meta+Delete");
    await page.waitForTimeout(200);
    expect(await canvasNodes(page)).toHaveLength(2);

    // Typing in the search box edits the text and never removes the piece.
    const nodes = await canvasNodes(page);
    const search = picker(page).getByRole("searchbox", { name: "Search pieces" });
    await search.click();
    await page.keyboard.type("linx");
    await page.keyboard.press("Backspace");
    await expect(search).toHaveValue("lin");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Delete");
    await expect(search).toHaveValue("li");
    await page.waitForTimeout(200);
    expectSameNodes(await canvasNodes(page), nodes);
    await expect(removeCross(page), "the piece is still selected").toBeVisible();

    // Backspace once focus leaves the field removes it.
    await search.blur();
    await page.keyboard.press("Backspace");
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(1);
  });

  test("(f) the ✕ hides during a drag and follows the piece after the drop, Undo/Redo and a resize", async ({
    authedPage: page,
  }, testInfo) => {
    await openBuilder(page);
    await addPiece(page, linen, 1);
    await addPiece(page, denim, 2);
    const top = await dragTopPieceToMiddle(page, testInfo);
    await expectCrossOnCorner(page, top, "after the first drag");
    const middle = await canvasNodes(page);

    const release = await holdDrag(page, testInfo, top, { x: 50, y: 60 });
    await expect(removeCross(page), "hidden while the pointer is held mid-drag").toBeHidden();
    await expect(selectionPill(page), "the pill stays").toBeVisible();
    await release();
    await expect(removeCross(page), "shown again after the drop").toBeVisible();
    await expectCrossOnCorner(page, top, "after the drop");
    expect((await canvasNodes(page))[top].y, "the piece moved").toBeGreaterThan(middle[top].y + 10);

    await page.getByRole("button", { name: "Undo" }).filter({ visible: true }).click();
    await expect.poll(async () => (await canvasNodes(page))[top].y).toBeCloseTo(middle[top].y, 6);
    await expectCrossOnCorner(page, top, "after Undo");
    await page.getByRole("button", { name: "Redo" }).filter({ visible: true }).click();
    await expect.poll(async () => (await canvasNodes(page))[top].y).toBeGreaterThan(middle[top].y + 10);
    await expectCrossOnCorner(page, top, "after Redo");

    if (testInfo.project.name === "desktop") {
      await page.setViewportSize({ width: 1100, height: 760 });
      await expectCrossOnCorner(page, top, "after a window resize");
    }
  });

  test("read-only detail page shows no ✕ and no pill", async ({ authedPage: page, userApi }) => {
    await openBuilder(page);
    await addPiece(page, linen, 1);
    const id = await saveNewLook(page, "Read only look");
    const [look] = await userApi.looks();
    expect(look.id).toBe(id);
    await page.goto(`/stylebook/${look.id}`);
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(1);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(200);
    const canvas = outfitCanvas(page).filter({ visible: true });
    await expect(canvas).toHaveCount(1);
    await expect(canvas.getByRole("button")).toHaveCount(0);
    await expect(canvas.getByRole("toolbar")).toHaveCount(0);
    expect(await canvasNodes(page)).toHaveLength(1);
  });
});
