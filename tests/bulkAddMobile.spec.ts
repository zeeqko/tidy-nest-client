import { test, expect, type Page, type Route } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * T8: compact per-photo rows + sticky footer at 375x800 (and one 1280px
 * desktop view). Uploads and /api/recognize are stubbed; everything else
 * (signup, categories) is the real backend. Screenshots land in
 * test-results/bulk-mobile/ for visual review.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => path.join(__dirname, "fixtures", name);
const SHOTS = path.join(__dirname, "..", "test-results", "bulk-mobile");
const shot = (name: string) => path.join(SHOTS, `${name}.png`);

const PHOTOS = Array.from({ length: 14 }, (_, i) => `photo-${String(i + 1).padStart(2, "0")}.png`);

let userCounter = 0;
async function signup(page: Page): Promise<void> {
  userCounter += 1;
  const email = `bulk-mobile-${Date.now()}-${userCounter}@example.com`;
  const response = await page.request.post("/api/auth/signup", {
    data: { name: "Bulk Mobile Tester", email, password: "password123" },
  });
  expect(response.ok()).toBe(true);
}

const bulkDialog = (page: Page) => page.getByRole("dialog", { name: "Add Multiple Photos" });
type Dialog = ReturnType<typeof bulkDialog>;

async function openBulk(page: Page, viewport = { width: 375, height: 800 }): Promise<Dialog> {
  await page.setViewportSize(viewport);
  await page.goto("/items");
  if (viewport.width < 640) {
    await page.getByRole("button", { name: "Add item" }).click();
  } else {
    await page.getByRole("button", { name: "Add Item" }).click();
  }
  await page.getByRole("button", { name: "Add multiple photos" }).click();
  const dialog = bulkDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Upload stub: the `failOn`-th POST (1-based) fails with a 500. */
async function stubUploads(page: Page, failOn: number | null) {
  let n = 0;
  await page.route("**/api/uploads", async (route: Route) => {
    n += 1;
    if (failOn !== null && n === failOn) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Upload failed on the server" }),
      });
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ url: `/uploads/fake-${n}.jpg` }),
    });
  });
}

/** Recognize stub by call order: calls 1-11 match (Food/Clothes alternating),
 *  call 12 returns a category not in the user's list, call 13+ 503s. An
 *  optional gate holds every response until released. */
async function stubRecognize(page: Page, gate?: Promise<void>) {
  let n = 0;
  await page.route("**/api/recognize", async (route: Route) => {
    n += 1;
    const call = n;
    if (gate) await gate;
    if (call <= 11) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          category: call % 2 === 0 ? "Clothes" : "Food",
          itemName: `Recognized ${call}`,
        }),
      });
    } else if (call === 12) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ category: "Spaceships", itemName: "Mystery Thing" }),
      });
    } else {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "AI recognition is not configured on this server." }),
      });
    }
  });
}

async function pickAll(dialog: Dialog) {
  await dialog.locator('input[type="file"]').setInputFiles(PHOTOS.map(fixture));
  await expect(dialog.getByTestId("bulk-card")).toHaveCount(14);
}

async function settle(dialog: Dialog) {
  await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 20000 });
  await expect(dialog.getByText("Recognizing…")).toHaveCount(0, { timeout: 20000 });
}

/** True scroll container of the modal body (nearest overflow-y:auto ancestor of a card). */
async function bodyOverflow(dialog: Dialog) {
  return dialog.getByTestId("bulk-card").first().evaluate((el) => {
    let node: HTMLElement | null = el.parentElement;
    while (node && getComputedStyle(node).overflowY !== "auto") node = node.parentElement;
    const body = node!;
    return {
      bodyScrollWidth: body.scrollWidth,
      bodyClientWidth: body.clientWidth,
      bodyScrollHeight: body.scrollHeight,
      bodyClientHeight: body.clientHeight,
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
    };
  });
}

async function scrollBodyTo(dialog: Dialog, fraction: number) {
  await dialog.getByTestId("bulk-card").first().evaluate((el, f) => {
    let node: HTMLElement | null = el.parentElement;
    while (node && getComputedStyle(node).overflowY !== "auto") node = node.parentElement;
    node!.scrollTop = (node!.scrollHeight - node!.clientHeight) * f;
  }, fraction);
}

test.describe("T8: 375x800 bulk add with 14 photos", () => {
  test.beforeEach(async ({ page }) => {
    await signup(page);
  });

  test("AI ON mixed outcomes: compact rows, no overflow, sticky footer with accurate status", async ({
    page,
  }) => {
    await stubUploads(page, 5);
    await stubRecognize(page);
    const dialog = await openBulk(page);

    // Empty state, top strip.
    await expect(dialog.getByRole("switch", { name: /Auto-recognize/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(dialog.getByRole("button", { name: "Add photos" })).toBeVisible();
    await page.screenshot({ path: shot("01-empty-top-strip") });

    await pickAll(dialog);
    await settle(dialog);

    // Top strip with cards.
    await scrollBodyTo(dialog, 0);
    await page.screenshot({ path: shot("02-top-strip-and-first-rows") });

    // Footer status line + button count.
    const status = dialog.locator("p", { has: page.getByText(/^\d+ of 14 ready/) });
    await expect(status).toHaveText(
      "11 of 14 ready · 2 need a category · 1 need a name · 1 failed to upload",
    );
    const addBtn = dialog.getByRole("button", { name: /^Add \d+ Items?$/ });
    await expect(addBtn).toHaveText("Add 11 Items");
    const readyNumber = Number((await status.innerText()).match(/^(\d+) of/)![1]);
    const buttonNumber = Number((await addBtn.innerText()).match(/\d+/)![0]);
    expect(buttonNumber).toBe(readyNumber);

    // Per-card outcomes.
    await expect(dialog.getByLabel("Picked by AI")).toHaveCount(11);
    const unset = dialog.getByLabel("Item category").locator("xpath=self::select[@aria-invalid='true']");
    await expect(unset).toHaveCount(2);
    await expect(dialog.getByText(/AI suggested "Spaceships"/)).toBeVisible();
    await expect(dialog.getByText("AI recognition is not configured on this server.")).toBeVisible();
    await expect(dialog.getByText("Upload failed on the server")).toBeVisible();

    // Collapsed ready row height.
    const aiCard = dialog
      .getByTestId("bulk-card")
      .filter({ has: page.getByLabel("Picked by AI") })
      .first();
    const box = await aiCard.boundingBox();
    expect.soft(box!.height, "collapsed AI-picked row height").toBeLessThanOrEqual(80);
    await aiCard.scrollIntoViewIfNeeded();
    await aiCard.screenshot({ path: shot("03-row-ai-picked") });

    // Red unset-category row.
    const unsetCard = dialog
      .getByTestId("bulk-card")
      .filter({ has: page.getByText(/AI suggested "Spaceships"/) });
    await unsetCard.scrollIntoViewIfNeeded();
    await unsetCard.screenshot({ path: shot("04-row-unset-category-unmatched") });
    const failedRecogCard = dialog
      .getByTestId("bulk-card")
      .filter({ has: page.getByText("AI recognition is not configured on this server.") });
    await failedRecogCard.scrollIntoViewIfNeeded();
    await failedRecogCard.screenshot({ path: shot("05-row-unset-category-recognize-failed") });

    // Upload error row.
    const errorCard = dialog
      .getByTestId("bulk-card")
      .filter({ has: page.getByText("Upload failed on the server") });
    await errorCard.scrollIntoViewIfNeeded();
    await expect(errorCard.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(errorCard.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
    await errorCard.screenshot({ path: shot("06-row-upload-error") });

    // Expanded Details.
    const detailsCard = dialog.getByTestId("bulk-card").filter({ has: page.getByLabel("Picked by AI") }).first();
    await detailsCard.scrollIntoViewIfNeeded();
    await detailsCard.getByRole("button", { name: /Details/ }).click();
    await expect(detailsCard.getByRole("button", { name: /Details/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(detailsCard.getByLabel("Item location")).toBeVisible();
    await detailsCard.screenshot({ path: shot("07-row-details-expanded") });

    // No horizontal overflow, with and without Details open.
    const o = await bodyOverflow(dialog);
    expect(o.bodyScrollWidth).toBeLessThanOrEqual(o.bodyClientWidth);
    expect(o.docScrollWidth).toBeLessThanOrEqual(o.docClientWidth);
    // The expanded card itself stays inside the viewport.
    const expandedBox = await detailsCard.boundingBox();
    expect(expandedBox!.x).toBeGreaterThanOrEqual(0);
    expect(expandedBox!.x + expandedBox!.width).toBeLessThanOrEqual(375);

    // Collapse again, scroll mid-way, footer stays put.
    await detailsCard.getByRole("button", { name: /Details/ }).click();
    expect((await bodyOverflow(dialog)).bodyScrollHeight).toBeGreaterThan(
      (await bodyOverflow(dialog)).bodyClientHeight,
    );
    await scrollBodyTo(dialog, 0.5);
    await expect(status).toBeInViewport();
    await expect(addBtn).toBeInViewport();
    const btnBox = await addBtn.boundingBox();
    expect(btnBox!.y + btnBox!.height).toBeLessThanOrEqual(800);
    await page.screenshot({ path: shot("08-sticky-footer-mid-scroll") });
    await scrollBodyTo(dialog, 1);
    await expect(addBtn).toBeInViewport();
    await page.screenshot({ path: shot("09-scrolled-to-bottom") });

    // Every collapsed ready/AI row is compact.
    const cards = await dialog.getByTestId("bulk-card").all();
    for (const c of cards) {
      const hasInput = (await c.getByLabel("Item name").count()) > 0;
      const hasNote = (await c.locator("p.text-\\[11px\\]").count()) > 0;
      if (hasInput && !hasNote) {
        expect.soft((await c.boundingBox())!.height, "collapsed row height").toBeLessThanOrEqual(80);
      }
    }
  });

  test("spinner overlay while recognizing (responses held)", async ({ page }) => {
    await stubUploads(page, null);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await stubRecognize(page, gate);
    const dialog = await openBulk(page);
    await pickAll(dialog);
    await expect(dialog.getByText("Recognizing…").first()).toBeAttached();
    await expect(dialog.getByText(/processing/)).toBeVisible();
    await page.screenshot({ path: shot("10-recognizing-overlay") });
    const o = await bodyOverflow(dialog);
    expect(o.bodyScrollWidth).toBeLessThanOrEqual(o.bodyClientWidth);
    release();
    await settle(dialog);
  });

  test("AI OFF: all 14 cards unset (red pills), footer reads 0 ready, no overflow", async ({
    page,
  }) => {
    await stubUploads(page, null);
    let recognizeCalls = 0;
    await page.route("**/api/recognize", async (route) => {
      recognizeCalls += 1;
      await route.fulfill({ status: 503, body: "{}" });
    });
    const dialog = await openBulk(page);
    await dialog.getByRole("switch", { name: /Auto-recognize/i }).click();
    await pickAll(dialog);
    await settle(dialog);
    expect(recognizeCalls).toBe(0);

    await expect(dialog.getByLabel("Item category")).toHaveCount(14);
    for (const sel of await dialog.getByLabel("Item category").all()) {
      await expect(sel).toHaveValue("");
      await expect(sel).toHaveAttribute("aria-invalid", "true");
    }
    // Untouched blank names stay neutral (no wall of red).
    await expect(dialog.getByLabel("Item name").locator("xpath=self::input[@aria-invalid='true']")).toHaveCount(0);
    await expect(dialog.getByLabel("Picked by AI")).toHaveCount(0);
    await expect(dialog.locator("p", { has: page.getByText(/^\d+ of 14 ready/) })).toHaveText(
      "0 of 14 ready · 14 need a category · 14 need a name",
    );
    await expect(dialog.getByRole("button", { name: "Nothing to add yet" })).toBeDisabled();
    await page.screenshot({ path: shot("11-ai-off-all-unset") });
    await scrollBodyTo(dialog, 0.5);
    await page.screenshot({ path: shot("12-ai-off-all-unset-mid-scroll") });

    const o = await bodyOverflow(dialog);
    expect(o.bodyScrollWidth).toBeLessThanOrEqual(o.bodyClientWidth);
    expect(o.docScrollWidth).toBeLessThanOrEqual(o.docClientWidth);

    // Picking a category + name for one card moves the count to 1 of 14.
    const first = dialog.getByTestId("bulk-card").first();
    await scrollBodyTo(dialog, 0);
    await first.getByLabel("Item name").fill("Hand named");
    const food = (await (await page.request.get("/api/categories/")).json()).find(
      (c: { name: string }) => c.name === "Food",
    );
    await first.getByLabel("Item category").selectOption(String(food.id));
    await expect(dialog.locator("p", { has: page.getByText(/^\d+ of 14 ready/) })).toHaveText(
      "1 of 14 ready · 13 need a category · 13 need a name",
    );
    await expect(dialog.getByRole("button", { name: "Add 1 Item" })).toBeVisible();
  });
});

test.describe("T8: 1280px desktop view", () => {
  test("rows stay a single compact column inside a narrow modal", async ({ page }) => {
    await signup(page);
    await stubUploads(page, 5);
    await stubRecognize(page);
    const dialog = await openBulk(page, { width: 1280, height: 800 });
    await pickAll(dialog);
    await settle(dialog);
    await page.screenshot({ path: shot("13-desktop-1280") });

    const modalBox = await dialog.boundingBox();
    expect(modalBox!.width).toBeLessThanOrEqual(660);
    // Single column: every card shares the same x and width.
    const boxes = await Promise.all((await dialog.getByTestId("bulk-card").all()).map((c) => c.boundingBox()));
    const xs = new Set(boxes.map((b) => Math.round(b!.x)));
    expect(xs.size).toBe(1);
    const o = await bodyOverflow(dialog);
    expect(o.bodyScrollWidth).toBeLessThanOrEqual(o.bodyClientWidth);
    await expect(dialog.locator("p", { has: page.getByText(/^\d+ of 14 ready/) })).toBeVisible();
  });
});
