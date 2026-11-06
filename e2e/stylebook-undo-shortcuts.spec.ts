// The builder header has no Undo / Redo buttons any more; history stays
// reachable through the keyboard: Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z and
// Ctrl+Y redo. Runs in the desktop (1440x900) and mobile (390x844) projects.
import { test, expect, ITEM_NAMES } from "./fixtures";
import {
  addPiece,
  boxesOverlap,
  canvasNodes,
  nodeScreenCenter,
  openBuilder,
  openSaveSheet,
  occasionChip,
  picker,
  pointerDrag,
  saveScreenshot,
  saveSheet,
  saveTrigger,
} from "./support/canvas";

const { linen, denim } = ITEM_NAMES;

const heading = (page: import("@playwright/test").Page) =>
  page.getByRole("heading", { level: 1, name: "Create a Look" }).filter({ visible: true });

test.describe("builder header without Undo / Redo", () => {
  test("no Undo / Redo buttons; the title and Save sit side by side without overlapping", async ({
    authedPage: page,
  }, testInfo) => {
    await openBuilder(page);
    await expect(page.getByRole("button", { name: /^(Undo|Redo)$/ })).toHaveCount(0);

    const title = (await heading(page).boundingBox())!;
    const save = (await saveTrigger(page).boundingBox())!;
    expect(title.width, "title is visible").toBeGreaterThan(80);
    expect(boxesOverlap(title, save), "title and Save do not overlap").toBe(false);
    expect(save.x + save.width, "Save inside the viewport").toBeLessThanOrEqual(page.viewportSize()!.width);

    if (testInfo.project.name === "desktop") {
      const close = (await page.getByRole("button", { name: "Close" }).boundingBox())!;
      expect(boxesOverlap(save, close)).toBe(false);
      expect(close.x, "Close sits right of Save").toBeGreaterThan(save.x + save.width - 1);
      await saveScreenshot(page, testInfo, "undo-header");
    } else {
      // Title left, Save right on the same row, back button first.
      const back = (await page.getByRole("button", { name: "Go back" }).boundingBox())!;
      expect(back.x).toBeLessThan(title.x);
      expect(title.x + title.width).toBeLessThan(save.x);
      expect(Math.abs(title.y + title.height / 2 - (save.y + save.height / 2))).toBeLessThan(12);
      await saveScreenshot(page, testInfo, "undo-header");
      await page.setViewportSize({ width: 375, height: 667 });
      await expect(heading(page)).toBeVisible();
      const t375 = (await heading(page).boundingBox())!;
      const s375 = (await saveTrigger(page).boundingBox())!;
      expect(boxesOverlap(t375, s375)).toBe(false);
      expect(t375.width, "title is not truncated to nothing at 375").toBeGreaterThan(100);
      await expect(heading(page)).toHaveText("Create a Look");
      expect(await heading(page).evaluate((el) => el.scrollWidth <= el.clientWidth), "title not ellipsized at 375").toBe(true);
      await saveScreenshot(page, testInfo, "undo-header-375");
    }
  });
});

test.describe("undo / redo keyboard shortcuts", () => {
  test("Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y step through history after adding and moving a piece", async ({
    authedPage: page,
  }, testInfo) => {
    await openBuilder(page);
    await addPiece(page, linen, 1);
    await addPiece(page, denim, 2);
    const added = await canvasNodes(page);

    const from = await nodeScreenCenter(page, 1);
    await pointerDrag(page, testInfo, from, { x: from.x + 25, y: from.y + 30 }, 8);
    await expect.poll(async () => (await canvasNodes(page))[1].y).toBeGreaterThan(added[1].y + 10);
    const moved = (await canvasNodes(page))[1];

    // Undo the move: back to where it was, both pieces still there.
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await canvasNodes(page))[1].y).toBeCloseTo(added[1].y, 6);
    expect((await canvasNodes(page)).length).toBe(2);
    // Redo with Ctrl+Shift+Z.
    await page.keyboard.press("Control+Shift+z");
    await expect.poll(async () => (await canvasNodes(page))[1].y).toBeCloseTo(moved.y, 6);
    // Undo twice (move, then the denim add), redo with Ctrl+Y.
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(1);
    await page.keyboard.press("Control+y");
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(2);
    // Meta works too (macOS).
    await page.keyboard.press("Meta+z");
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(1);
    // Empty stacks: extra presses do nothing.
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(0);
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(200);
    expect((await canvasNodes(page)).length).toBe(0);
    await saveScreenshot(page, testInfo, "undo-shortcut-empty");
  });

  test("they do not fire while typing in the picker search box", async ({ authedPage: page }) => {
    await openBuilder(page);
    await addPiece(page, linen, 1);
    const search = picker(page).getByRole("searchbox", { name: "Search pieces" });
    await search.click();
    await page.keyboard.type("abc");
    await expect(search).toHaveValue("abc");
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+Shift+z");
    await page.keyboard.press("Control+y");
    await page.waitForTimeout(200);
    expect((await canvasNodes(page)).length, "the piece was not undone").toBe(1);
    await expect(search).toBeFocused();
    // The browser's own text undo handled the key instead of the builder.
    await expect(search).not.toHaveValue("abcabc");
  });

  test("they do not fire while the Save sheet is open", async ({ authedPage: page }) => {
    await openBuilder(page);
    await addPiece(page, linen, 1);
    await addPiece(page, denim, 2);
    await openSaveSheet(page);
    // Focus a non-text control inside the sheet, then try the shortcuts.
    await occasionChip(page, "Work").focus();
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+Shift+z");
    await page.waitForTimeout(200);
    expect((await canvasNodes(page)).length).toBe(2);
    await page.keyboard.press("Escape");
    await expect(saveSheet(page)).toHaveCount(0);
    // Closed again: the shortcut works.
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(1);
  });
});
