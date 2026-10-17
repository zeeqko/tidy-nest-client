import { test, expect, type Locator, type Page, type Route } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * T3 (client/src/components/BulkAddItemsModal.tsx, BulkAddCard.tsx,
 * AddItemChooser.tsx + entry-point wiring) coverage.
 *
 * Per PLAN.md's "bulk add items from a multi-photo selection" plan's testing
 * notes: every spec here stubs /api/recognize (never hits real Gemini);
 * /api/uploads is stubbed for ingest-phase specs but let through for real at
 * least once; the hidden multi-file input is driven via
 * page.setInputFiles against small PNG fixtures under tests/fixtures/;
 * the concurrency cap is asserted by counting overlapping in-flight
 * requests, not totals. Categories are per photo (every card starts with no
 * category unless AI picks one, or the modal was opened from a category page
 * with auto-recognize OFF); tier-2 fields live behind each card's "Details"
 * button. Tests in this file never commit, so each guards that
 * POST /api/inventory/ is never called (commit coverage lives in
 * bulkAddCommit.spec.ts).
 *
 * Each spec signs up its own fresh user via POST /api/auth/signup through
 * page.request (cookies are shared with page) — a fresh signup seeds
 * Food/Clothes/Makeup/Shoes/Bags/Books. Per this file's own local-helper
 * convention (no shared helpers module), all helpers live below.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => path.join(__dirname, "fixtures", name);

let userCounter = 0;

/** Signs up a brand-new user for this test and leaves the page on "/". */
async function signup(page: Page): Promise<void> {
  userCounter += 1;
  const email = `bulk-test-${Date.now()}-${userCounter}@example.com`;
  const response = await page.request.post("/api/auth/signup", {
    data: { name: "Bulk Tester", email, password: "password123" },
  });
  expect(response.ok()).toBe(true);
  await page.goto("/");
}

interface ApiCategoryLite {
  id: number;
  name: string;
}

/** Fetches this user's seeded categories via the API (name -> id lookup),
 *  rather than hardcoding ids, since they are DB auto-increment values. */
async function getCategories(page: Page): Promise<ApiCategoryLite[]> {
  const response = await page.request.get("/api/categories/");
  return response.json();
}

/** Counts POST /api/inventory/ calls (never blocks them — `route.fallback()`
 *  always lets the request continue) so callers can assert `.count() === 0`.
 *  T3 has no commit pass, so this endpoint must never be hit by anything in
 *  this file. */
function guardNoItemCreation(page: Page): { count: () => number } {
  const state = { count: 0 };
  void page.route("**/api/inventory/", async (route: Route) => {
    if (route.request().method() === "POST") {
      state.count += 1;
    }
    await route.fallback();
  });
  return { count: () => state.count };
}

/** Always-fulfilling /api/uploads stub — 201 with a unique fake URL per call. */
function stubUploadsSuccess(page: Page) {
  let n = 0;
  return page.route("**/api/uploads", async (route: Route) => {
    n += 1;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ url: `/uploads/fake-${n}.jpg` }),
    });
  });
}

/** /api/recognize stub returning a fixed category+name every time. */
function stubRecognizeMatching(page: Page, category: string, itemName: string) {
  return page.route("**/api/recognize", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ category, itemName }),
    });
  });
}

/** Counts invocations of /api/recognize without ever letting one through to
 *  a real backend — used to assert "zero calls" for the toggle-off case. */
function countRecognizeCalls(page: Page): { count: () => number } {
  const state = { count: 0 };
  void page.route("**/api/recognize", async (route: Route) => {
    state.count += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ category: "Clothes", itemName: "Should Not Be Named" }),
    });
  });
  return { count: () => state.count };
}

/** Opens a card's "Details" disclosure (tier-2 fields, incl. subcategory and
 *  location, only render once open). */
async function openDetails(dialog: Locator, index = 0): Promise<void> {
  const button = dialog.getByRole("button", { name: "Details" }).nth(index);
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
}

/** Stub /api/recognize with an arbitrary JSON body / status. */
function stubRecognize(page: Page, status: number, body: unknown) {
  return page.route("**/api/recognize", (route: Route) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }),
  );
}

const STORAGE_KEY = "bulkAdd.autoRecognize";

const dialogByTitle = (page: Page, title: string) => page.getByRole("dialog", { name: title });
const bulkDialog = (page: Page) => dialogByTitle(page, "Add Multiple Photos");
const itemFormDialog = (page: Page, title: "Add Item" | "Edit Item" = "Add Item") =>
  dialogByTitle(page, title);
// ModalShell's "alert" variant (AddItemChooser, ConfirmDeleteModal) sets
// role="alertdialog" but no aria-label/aria-labelledby, so it has no
// computed accessible name for getByRole's {name} filter — locate by role
// plus visible text instead.
const alertDialogWithText = (page: Page, text: string | RegExp) =>
  page.getByRole("alertdialog").filter({ hasText: text });
const chooserDialog = (page: Page) => alertDialogWithText(page, "Add Items");

/** Opens the chooser from AllItemsPage's desktop "Add Item" pill. */
async function openChooserFromAllItems(page: Page): Promise<void> {
  await page.goto("/items");
  await page.getByRole("button", { name: "Add Item" }).click();
  await expect(chooserDialog(page)).toBeVisible();
}

/** Opens the chooser from a CategoryPage's desktop "Add Item" pill. */
async function openChooserFromCategoryPage(page: Page, categoryId: number): Promise<void> {
  await page.goto(`/category/${categoryId}`);
  await page.getByRole("button", { name: "Add Item" }).click();
  await expect(chooserDialog(page)).toBeVisible();
}

/** Opens the chooser from AppLayout's mobile bottom-nav "+" (resizes to a
 *  mobile viewport first, since that's the only surface it renders on). */
async function openChooserFromBottomNav(page: Page, url = "/items"): Promise<void> {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(url);
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(chooserDialog(page)).toBeVisible();
}

test.describe("AddItemChooser entry points", () => {
  test("AllItemsPage: chooser opens, 'Add one item' opens ItemFormModal with no preselection", async ({
    page,
  }) => {
    await signup(page);
    await openChooserFromAllItems(page);

    await page.getByRole("button", { name: "Add one item" }).click();
    await expect(chooserDialog(page)).toHaveCount(0);
    const dialog = itemFormDialog(page);
    await expect(dialog).toBeVisible();
    // No preselection on /items — just confirm the regular ItemFormModal
    // opened intact (unchanged by this ticket) rather than something broken.
    await expect(dialog.getByLabel("Name")).toBeVisible();
    await expect(dialog.locator("select")).toBeVisible();
  });

  test("CategoryPage: chooser opens from the header pill, 'Add one item' preselects that category", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const clothes = categories.find((c) => c.name === "Clothes")!;
    await openChooserFromCategoryPage(page, clothes.id);

    await page.getByRole("button", { name: "Add one item" }).click();
    const dialog = itemFormDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("select")).toHaveValue(String(clothes.id));
  });

  test("CategoryPage: chooser also opens from the empty-state 'Add your first item' action", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const shoes = categories.find((c) => c.name === "Shoes")!;
    await page.goto(`/category/${shoes.id}`);
    await page.getByRole("button", { name: "Add your first item" }).click();
    await expect(chooserDialog(page)).toBeVisible();
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    await expect(bulkDialog(page)).toBeVisible();
    // The page's category only pre-seeds new cards when auto-recognize is OFF;
    // that behaviour is covered in "category-page entry" below.
  });

  test("AppLayout bottom-nav '+' on /category/:id: chooser opens, both options preselect that category", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const makeup = categories.find((c) => c.name === "Makeup")!;
    await openChooserFromBottomNav(page, `/category/${makeup.id}`);

    await page.getByRole("button", { name: "Add one item" }).click();
    const dialog = itemFormDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("select")).toHaveValue(String(makeup.id));
  });

  test("all three entry points' 'Add multiple photos' opens the bulk modal", async ({ page }) => {
    await signup(page);

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    await expect(bulkDialog(page)).toBeVisible();
    // Close it (nothing picked yet -> closes silently) before the next entry
    // point, since AllItemsPage's bulkOpen state would otherwise persist.
    await page.getByRole("button", { name: "Close" }).click();
    await expect(bulkDialog(page)).toHaveCount(0);

    const categories = await getCategories(page);
    const bags = categories.find((c) => c.name === "Bags")!;
    await openChooserFromCategoryPage(page, bags.id);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    await expect(bulkDialog(page)).toBeVisible();
  });

  test("chooser's 'Cancel' closes without opening either flow", async ({ page }) => {
    await signup(page);
    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(chooserDialog(page)).toHaveCount(0);
    await expect(bulkDialog(page)).toHaveCount(0);
  });
});

test.describe("BulkAddItemsModal: picking renders cards immediately", () => {
  test("selecting 5 files renders 5 cards immediately with visible, undistorted thumbnails", async ({
    page,
  }) => {
    await signup(page);
    const guard = guardNoItemCreation(page);
    await stubUploadsSuccess(page);
    await page.route("**/api/recognize", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ category: "Food", itemName: "Thing" }) }),
    );
    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await expect(dialog).toBeVisible();

    const files = [1, 2, 3, 4, 5].map((n) => fixture(`photo-${String(n).padStart(2, "0")}.png`));
    await dialog.locator('input[type="file"]').setInputFiles(files);

    const thumbs = dialog.locator('img[alt=""]');
    await expect(thumbs).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      const box = await thumbs.nth(i).boundingBox();
      expect(box?.width ?? 0).toBeGreaterThan(0);
      expect(box?.height ?? 0).toBeGreaterThan(0);
      const loaded = await thumbs.nth(i).evaluate(
        (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
      );
      expect(loaded).toBe(true);
      await expect(thumbs.nth(i)).toHaveAttribute("src", /^blob:/);
    }
    expect(guard.count()).toBe(0);
  });
});

test.describe("BulkAddItemsModal: auto-recognize toggle", () => {
  test("toggle ON (default): card lands with AI name + AI category, sparkle 'Picked by AI' visible", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const clothes = categories.find((c) => c.name === "Clothes")!;
    const guard = guardNoItemCreation(page);
    await stubUploadsSuccess(page);
    await stubRecognizeMatching(page, "Clothes", "Running Sneakers");

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    const toggle = dialog.getByRole("switch", { name: /Auto-recognize/i });
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-red.png")]);

    await expect(dialog.getByLabel("Item name")).toHaveValue("Running Sneakers", { timeout: 15000 });
    await expect(dialog.getByLabel("Item category")).toHaveValue(String(clothes.id));
    await expect(dialog.getByRole("img", { name: "Picked by AI" })).toHaveCount(1);
    await expect(dialog.getByText("1 of 1 ready", { exact: true })).toBeVisible();
    expect(guard.count()).toBe(0);
  });

  test("toggle ON: a manual category change drops the sparkle", async ({ page }) => {
    await signup(page);
    const categories = await getCategories(page);
    const food = categories.find((c) => c.name === "Food")!;
    await stubUploadsSuccess(page);
    await stubRecognizeMatching(page, "Clothes", "Scarf");

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-red.png")]);
    await expect(dialog.getByRole("img", { name: "Picked by AI" })).toHaveCount(1, { timeout: 15000 });

    await dialog.getByLabel("Item category").selectOption(String(food.id));
    await expect(dialog.getByRole("img", { name: "Picked by AI" })).toHaveCount(0);
    await expect(dialog.getByLabel("Item category")).toHaveValue(String(food.id));
  });

  test("toggle OFF: zero /api/recognize requests; cards show 'Choose category' and an empty name; commit blocked until a category is chosen", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const food = categories.find((c) => c.name === "Food")!;
    const guard = guardNoItemCreation(page);
    await stubUploadsSuccess(page);
    const recognizeCalls = countRecognizeCalls(page);

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    const toggle = dialog.getByRole("switch", { name: /Auto-recognize/i });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    await dialog
      .locator('input[type="file"]')
      .setInputFiles([fixture("photo-01.png"), fixture("photo-02.png"), fixture("photo-03.png")]);

    const nameInputs = dialog.getByLabel("Item name");
    await expect(nameInputs).toHaveCount(3);
    await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 15000 });

    const categorySelects = dialog.getByLabel("Item category");
    for (let i = 0; i < 3; i++) {
      await expect(nameInputs.nth(i)).toHaveValue("");
      await expect(categorySelects.nth(i)).toHaveValue("");
      await expect(categorySelects.nth(i).locator("option:checked")).toHaveText("Choose category");
    }
    await expect(dialog.getByRole("img", { name: "Picked by AI" })).toHaveCount(0);

    // Commit blocked: names typed but still no categories.
    const commit = dialog.getByRole("button", { name: /^(Add \d+ Items?|Nothing to add yet)$/ });
    await nameInputs.nth(0).fill("Named, no category");
    await expect(commit).toHaveText("Nothing to add yet");
    await expect(commit).toBeDisabled();
    await expect(dialog.getByText(/1 of 3 ready/)).toHaveCount(0);
    await expect(dialog.getByText("0 of 3 ready · 3 need a category · 2 need a name")).toBeVisible();

    // Choosing a category unblocks exactly that card.
    await categorySelects.nth(0).selectOption(String(food.id));
    await expect(commit).toHaveText("Add 1 Item");
    await expect(commit).toBeEnabled();
    await expect(dialog.getByText("1 of 3 ready · 2 need a category · 2 need a name")).toBeVisible();

    expect(recognizeCalls.count()).toBe(0);
    expect(guard.count()).toBe(0);
  });
});

test.describe("BulkAddItemsModal: AI category outcomes", () => {
  test("recognition returns a category not in the user's list: category stays unset, 'AI suggested' note shown, note disappears once the user picks a category; name still prefilled", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const shoes = categories.find((c) => c.name === "Shoes")!;
    const guard = guardNoItemCreation(page);
    await stubUploadsSuccess(page);
    await stubRecognize(page, 200, { category: "Spaceships", itemName: "Rocket Toy" });

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-01.png")]);

    const note = dialog.getByText('AI suggested "Spaceships" — choose a category');
    await expect(note).toBeVisible({ timeout: 15000 });
    await expect(dialog.getByLabel("Item category")).toHaveValue("");
    await expect(dialog.getByLabel("Item name")).toHaveValue("Rocket Toy");
    await expect(dialog.getByRole("img", { name: "Picked by AI" })).toHaveCount(0);
    await expect(dialog.getByLabel("Item category")).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByText("0 of 1 ready · 1 need a category")).toBeVisible();

    await dialog.getByLabel("Item category").selectOption(String(shoes.id));
    await expect(note).toHaveCount(0);
    await expect(dialog.getByText("1 of 1 ready")).toBeVisible();
    expect(guard.count()).toBe(0);
  });

  test("a stubbed /api/recognize 503 leaves each card ready with empty name, unset category and the failure note, not an error card", async ({
    page,
  }) => {
    await signup(page);
    const guard = guardNoItemCreation(page);
    await stubUploadsSuccess(page);
    await stubRecognize(page, 503, { error: "AI recognition is not configured" });

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog
      .locator('input[type="file"]')
      .setInputFiles([fixture("photo-12.png"), fixture("photo-13.png")]);

    await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 15000 });
    await expect(dialog.getByText("Recognizing…")).toHaveCount(0, { timeout: 15000 });

    const nameInputs = dialog.getByLabel("Item name");
    const categorySelects = dialog.getByLabel("Item category");
    await expect(nameInputs).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      await expect(nameInputs.nth(i)).toHaveValue("");
      await expect(categorySelects.nth(i)).toHaveValue("");
    }
    await expect(dialog.getByText("AI recognition is not configured")).toHaveCount(2);
    await expect(dialog.getByRole("button", { name: "Retry" })).toHaveCount(0);
    await expect(dialog.getByText("0 of 2 ready · 2 need a category · 2 need a name")).toBeVisible();
    expect(guard.count()).toBe(0);
  });

  test("a category picked while the card is still 'Recognizing…' survives a later AI match for a different category; sparkle stays off, name still fills", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const food = categories.find((c) => c.name === "Food")!;
    await stubUploadsSuccess(page);

    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/recognize", async (route: Route) => {
      await gate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ category: "Clothes", itemName: "Late AI Name" }),
      });
    });

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-01.png")]);
    await expect(dialog.getByText("Recognizing…")).toBeVisible({ timeout: 15000 });

    await dialog.getByLabel("Item category").selectOption(String(food.id));
    release();
    await expect(dialog.getByText("Recognizing…")).toHaveCount(0);

    await expect(dialog.getByLabel("Item name")).toHaveValue("Late AI Name");
    await expect(dialog.getByLabel("Item category")).toHaveValue(String(food.id));
    await expect(dialog.getByRole("img", { name: "Picked by AI" })).toHaveCount(0);
  });

  test("a name typed while 'Recognizing…' is not overwritten by the recognized name (category still AI-picked)", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const clothes = categories.find((c) => c.name === "Clothes")!;
    await stubUploadsSuccess(page);

    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/recognize", async (route: Route) => {
      await gate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ category: "Clothes", itemName: "AI Name" }),
      });
    });

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-01.png")]);
    await expect(dialog.getByText("Recognizing…")).toBeVisible({ timeout: 15000 });

    await dialog.getByLabel("Item name").fill("My Typed Name");
    release();
    await expect(dialog.getByText("Recognizing…")).toHaveCount(0);

    await expect(dialog.getByLabel("Item name")).toHaveValue("My Typed Name");
    await expect(dialog.getByLabel("Item category")).toHaveValue(String(clothes.id));
    await expect(dialog.getByRole("img", { name: "Picked by AI" })).toHaveCount(1);
  });
});

test.describe("BulkAddItemsModal: toggle persistence (localStorage)", () => {
  async function openBulk(page: Page): Promise<Locator> {
    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test("the last choice survives a full page reload (OFF -> reload -> still OFF; ON -> reload -> ON), stored as '0'/'1'", async ({
    page,
  }) => {
    await signup(page);
    let dialog = await openBulk(page);
    const toggle = () => dialog.getByRole("switch", { name: /Auto-recognize/i });
    await expect(toggle()).toHaveAttribute("aria-checked", "true");

    await toggle().click();
    await expect(toggle()).toHaveAttribute("aria-checked", "false");
    expect(await page.evaluate((k) => window.localStorage.getItem(k), STORAGE_KEY)).toBe("0");

    await page.reload();
    dialog = await openBulk(page);
    await expect(toggle()).toHaveAttribute("aria-checked", "false");

    await toggle().click();
    await expect(toggle()).toHaveAttribute("aria-checked", "true");
    expect(await page.evaluate((k) => window.localStorage.getItem(k), STORAGE_KEY)).toBe("1");

    await page.reload();
    dialog = await openBulk(page);
    await expect(toggle()).toHaveAttribute("aria-checked", "true");
  });

  test("a persisted OFF applies to the next batch: no /api/recognize calls after reload", async ({
    page,
  }) => {
    await signup(page);
    await stubUploadsSuccess(page);
    const recognizeCalls = countRecognizeCalls(page);
    let dialog = await openBulk(page);
    await dialog.getByRole("switch", { name: /Auto-recognize/i }).click();
    await page.reload();
    dialog = await openBulk(page);
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-01.png")]);
    await expect(dialog.getByLabel("Item name")).toHaveCount(1);
    await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 15000 });
    await expect(dialog.getByLabel("Item category")).toHaveValue("");
    expect(recognizeCalls.count()).toBe(0);
  });

  test("localStorage.getItem throwing: modal opens without crashing and falls back to ON", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.addInitScript((key) => {
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = function (k: string) {
        if (k === key) throw new Error("storage blocked");
        return original.call(this, k);
      };
    }, STORAGE_KEY);
    await signup(page);
    // Even a stored "0" must not be reachable through the blocked getter.
    await page.evaluate((k) => window.localStorage.setItem(k, "0"), STORAGE_KEY);
    const dialog = await openBulk(page);
    await expect(dialog.getByRole("switch", { name: /Auto-recognize/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(pageErrors).toEqual([]);
  });

  test("localStorage.setItem throwing: toggling does not crash and still works for this session; next load falls back to ON", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.addInitScript((key) => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k === key) throw new Error("quota exceeded");
        return original.call(this, k, v);
      };
    }, STORAGE_KEY);
    await signup(page);
    let dialog = await openBulk(page);
    const toggle = () => dialog.getByRole("switch", { name: /Auto-recognize/i });
    await toggle().click();
    await expect(toggle()).toHaveAttribute("aria-checked", "false");
    await expect(dialog).toBeVisible();

    await page.reload();
    dialog = await openBulk(page);
    await expect(toggle()).toHaveAttribute("aria-checked", "true");
    expect(pageErrors).toEqual([]);
  });
});

test.describe("BulkAddItemsModal: category-page entry (initialCategoryId)", () => {
  async function openBulkFromCategory(page: Page, categoryId: number): Promise<Locator> {
    await openChooserFromCategoryPage(page, categoryId);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test("auto-recognize OFF: new cards are pre-seeded with the page's category, no recognize calls", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const shoes = categories.find((c) => c.name === "Shoes")!;
    await stubUploadsSuccess(page);
    const recognizeCalls = countRecognizeCalls(page);

    const dialog = await openBulkFromCategory(page, shoes.id);
    await dialog.getByRole("switch", { name: /Auto-recognize/i }).click();
    await dialog
      .locator('input[type="file"]')
      .setInputFiles([fixture("photo-01.png"), fixture("photo-02.png")]);
    await expect(dialog.getByLabel("Item name")).toHaveCount(2);
    await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 15000 });

    for (let i = 0; i < 2; i++) {
      await expect(dialog.getByLabel("Item category").nth(i)).toHaveValue(String(shoes.id));
    }
    await expect(dialog.getByRole("img", { name: "Picked by AI" })).toHaveCount(0);
    expect(recognizeCalls.count()).toBe(0);
  });

  test("auto-recognize ON (default): cards are NOT pre-seeded; the AI's category wins over the page's", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const shoes = categories.find((c) => c.name === "Shoes")!;
    const food = categories.find((c) => c.name === "Food")!;
    await stubUploadsSuccess(page);

    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/recognize", async (route: Route) => {
      await gate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ category: "Food", itemName: "Granola" }),
      });
    });

    const dialog = await openBulkFromCategory(page, shoes.id);
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-01.png")]);
    await expect(dialog.getByText("Recognizing…")).toBeVisible({ timeout: 15000 });
    // Mid-recognition the card must not carry the page's category.
    await expect(dialog.getByLabel("Item category")).toHaveValue("");

    release();
    await expect(dialog.getByLabel("Item category")).toHaveValue(String(food.id));
    await expect(dialog.getByRole("img", { name: "Picked by AI" })).toHaveCount(1);
  });

  test("auto-recognize ON + recognition fails (503): category stays unset, no fallback to the page's category", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const shoes = categories.find((c) => c.name === "Shoes")!;
    await stubUploadsSuccess(page);
    await stubRecognize(page, 503, { error: "AI recognition is not configured" });

    const dialog = await openBulkFromCategory(page, shoes.id);
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-01.png")]);
    await expect(dialog.getByText("AI recognition is not configured")).toBeVisible({ timeout: 15000 });
    await expect(dialog.getByLabel("Item category")).toHaveValue("");
    await expect(dialog.getByText("0 of 1 ready · 1 need a category · 1 need a name")).toBeVisible();
  });

  test("auto-recognize ON + unmatched suggestion: category stays unset, no fallback to the page's category", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const shoes = categories.find((c) => c.name === "Shoes")!;
    await stubUploadsSuccess(page);
    await stubRecognize(page, 200, { category: "Spaceships", itemName: "Rocket" });

    const dialog = await openBulkFromCategory(page, shoes.id);
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-01.png")]);
    await expect(dialog.getByText('AI suggested "Spaceships" — choose a category')).toBeVisible({
      timeout: 15000,
    });
    await expect(dialog.getByLabel("Item category")).toHaveValue("");
  });

  test("auto-recognize ON + AI match equal to the page's own category: AI-picked (sparkle) and set, name filled", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const food = categories.find((c) => c.name === "Food")!;
    await stubUploadsSuccess(page);

    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/recognize", async (route: Route) => {
      await gate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ category: "Food", itemName: "Cheddar" }),
      });
    });

    const dialog = await openBulkFromCategory(page, food.id);
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-01.png")]);
    await expect(dialog.getByText("Recognizing…")).toBeVisible({ timeout: 15000 });
    release();
    await expect(dialog.getByLabel("Item category")).toHaveValue(String(food.id));
    await expect(dialog.getByRole("img", { name: "Picked by AI" })).toHaveCount(1);
    await expect(dialog.getByLabel("Item name")).toHaveValue("Cheddar");
  });
});

test.describe("BulkAddItemsModal: concurrency cap", () => {
  test("concurrent in-flight ingest requests never exceed 4", async ({ page }) => {
    await signup(page);
    const guard = guardNoItemCreation(page);
    let inFlight = 0;
    let peak = 0;
    const neverResolve = new Promise<void>(() => {});
    await page.route("**/api/uploads", async (_route: Route) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await neverResolve; // hold every request open forever
    });

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog.getByRole("switch", { name: /Auto-recognize/i }).click(); // OFF, keep this simple

    const files = Array.from({ length: 8 }, (_, i) =>
      fixture(`photo-${String(i + 1).padStart(2, "0")}.png`),
    );
    await dialog.locator('input[type="file"]').setInputFiles(files);

    // Give every task that's going to start a chance to actually issue its
    // fetch, then assert the observed peak never went past 4.
    await expect
      .poll(() => inFlight, { timeout: 5000 })
      .toBe(4);
    // Hold for a bit longer to make sure a 5th never sneaks in.
    await page.waitForTimeout(500);
    expect(inFlight).toBe(4);
    expect(peak).toBe(4);
    expect(guard.count()).toBe(0);
  });
});

test.describe("BulkAddCard: subcategory field (inside Details)", () => {
  test("changing a card's own category clears its subcategory and re-derives the picker's options/placeholder from the new category", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const food = categories.find((c) => c.name === "Food")!;
    const clothes = categories.find((c) => c.name === "Clothes")!;
    await stubUploadsSuccess(page);

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog.getByRole("switch", { name: /Auto-recognize/i }).click(); // OFF
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-01.png")]);
    await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 15000 });

    await dialog.getByLabel("Item category").selectOption(String(food.id));
    await openDetails(dialog);
    const subcategoryTrigger = dialog.getByLabel("Item subcategory");
    // Food's seeded subcategories (default_categories.go): Dairy, Meat.
    await expect(subcategoryTrigger).toContainText("e.g. Dairy");
    await subcategoryTrigger.click();
    await page.getByRole("button", { name: "Dairy", exact: true }).click();
    await expect(subcategoryTrigger).toContainText("Dairy");

    // Changing this card's own category clears its subcategory (settled
    // decision 9) and re-derives the placeholder from the *new* category —
    // Clothes' seeded subcategories are Outerwear, Tops.
    await dialog.getByLabel("Item category").selectOption(String(clothes.id));
    await expect(subcategoryTrigger).toContainText("e.g. Outerwear");
    await expect(subcategoryTrigger).not.toContainText("Dairy");
  });

  test("a category with no subcategories shows 'Add a subcategory', never another category's example", async ({
    page,
  }) => {
    await signup(page);
    // A freshly created category starts with no subcategories and no tags
    // (per PLAN.md's testing notes for this exact case).
    const created = await page.request.post("/api/categories/", {
      data: { name: "Gadgets" },
    });
    expect(created.ok()).toBe(true);
    const gadgets = await created.json();
    await stubUploadsSuccess(page);

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog.getByRole("switch", { name: /Auto-recognize/i }).click(); // OFF
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-02.png")]);
    await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 15000 });

    await dialog.getByLabel("Item category").selectOption(String(gadgets.id));
    await openDetails(dialog);
    await expect(dialog.getByLabel("Item subcategory")).toHaveText("Add a subcategory");
  });

  test("Escape with the subcategory picker open closes only the picker; a second, picker-free Escape raises the discard confirm", async ({
    page,
  }) => {
    await signup(page);
    await stubUploadsSuccess(page);

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog.getByRole("switch", { name: /Auto-recognize/i }).click(); // OFF
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-03.png")]);
    await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 15000 });

    await dialog.getByLabel("Item category").selectOption({ label: "Food" });
    await openDetails(dialog);
    await dialog.getByLabel("Item subcategory").click();
    const searchInput = page.getByPlaceholder("Search or add a subcategory…");
    await expect(searchInput).toBeVisible();

    // First Escape: the picker absorbs it and closes; the modal's own
    // discard confirm must not appear.
    await page.keyboard.press("Escape");
    await expect(searchInput).toHaveCount(0);
    await expect(alertDialogWithText(page, "Discard this batch?")).toHaveCount(0);
    await expect(dialog).toBeVisible();

    // Second, picker-free Escape: now the modal's own close guard fires.
    await page.keyboard.press("Escape");
    await expect(alertDialogWithText(page, "Discard this batch?")).toBeVisible();
  });

  test("with 30 cards, typing a 20-character name into one card lands all 20 characters and does not alter any other card", async ({
    page,
  }) => {
    await signup(page);
    await stubUploadsSuccess(page);
    await page.route("**/api/recognize", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ category: "Food", itemName: "X" }),
      }),
    );

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog.getByRole("switch", { name: /Auto-recognize/i }).click(); // OFF, fast settle

    const files = Array.from({ length: 30 }, (_, i) =>
      fixture(`photo-${String(i + 1).padStart(2, "0")}.png`),
    );
    await dialog.locator('input[type="file"]').setInputFiles(files);
    await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 20000 });

    const nameInputs = dialog.getByLabel("Item name");
    await expect(nameInputs).toHaveCount(30);

    const targetIndex = 15;
    const typed = "Twenty Char Name Xx".slice(0, 20).padEnd(20, "x");
    await nameInputs.nth(targetIndex).fill(typed);
    await expect(nameInputs.nth(targetIndex)).toHaveValue(typed);
    expect(typed).toHaveLength(20);

    // Every other card's name input is untouched (still empty).
    for (const i of [0, 1, 14, 16, 29]) {
      await expect(nameInputs.nth(i)).toHaveValue("");
    }
  });

  test("while a commit pass is in flight, an untouched ready card's subcategory field becomes a static, non-interactive placeholder", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const food = categories.find((c) => c.name === "Food")!;
    await stubUploadsSuccess(page);

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog.getByRole("switch", { name: /Auto-recognize/i }).click(); // OFF
    await dialog
      .locator('input[type="file"]')
      .setInputFiles([fixture("photo-01.png"), fixture("photo-02.png")]);
    await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 15000 });

    // Card 0 is made committable; card 1 is deliberately left with a blank
    // name so it stays `ready` (and therefore keeps rendering its field
    // stack) throughout the whole commit pass below, instead of moving to
    // `creating`.
    await dialog.getByLabel("Item name").nth(0).fill("Committed Item");
    await dialog.getByLabel("Item category").nth(0).selectOption(String(food.id));
    // Card 1 has a category (so the Dairy placeholder is derived) but no
    // name; its Details are open so the subcategory field is rendered.
    await dialog.getByLabel("Item category").nth(1).selectOption(String(food.id));
    await openDetails(dialog, 1);

    // Hold every POST /api/inventory/ open forever so `committing` stays
    // true for the entire test.
    const neverResolve = new Promise<void>(() => {});
    await page.route("**/api/inventory/", async (route: Route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await neverResolve;
    });

    await dialog.getByRole("button", { name: /^Add \d+ Items?$/ }).click();
    await expect(dialog.getByText("Adding…").first()).toBeVisible();

    // Card 1 (still `ready`, not part of this pass) no longer exposes a
    // `getByLabel("Item subcategory")` target at all — the live OptionPicker
    // button has been swapped for a static, aria-hidden lookalike, which
    // (unlike a CSS-only `pointer-events-none` wrapper around the same
    // button) is neither labelable nor reachable via role=button, so it
    // can't be Tab'd to or activated by keyboard while disabled.
    await expect(dialog.getByLabel("Item subcategory")).toHaveCount(0);
    // Check specifically for a leftover live button by its exact accessible
    // name (a loose regex could match unrelated controls).
    await expect(
      dialog.getByRole("button", { name: "Item subcategory", exact: true }),
    ).toHaveCount(0);
    // The placeholder text itself is still visible (not hidden from sight,
    // just out of the accessibility tree and out of tab order).
    await expect(dialog.getByText("e.g. Dairy")).toBeVisible();
  });

  test("a subcategory picked while a card is still recognizing survives a recognition match that confirms the same category", async ({
    page,
  }) => {
    // Regression test: a recognition match landing *after* the user picked a
    // subcategory, but *before* recognition resolved, must not clear that
    // subcategory when the match confirms the card's *existing* category
    // (fields aren't disabled during "recognizing", so this is a real,
    // reachable race). The user's own pick is also protected from a *different*
    // late AI category via `categoryTouchedByUser` (separate test above).
    await signup(page);
    const categories = await getCategories(page);
    const food = categories.find((c) => c.name === "Food")!;
    await stubUploadsSuccess(page);

    // Gate /api/recognize so the card can be interacted with while still
    // in the "recognizing" stage.
    let releaseRecognize: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseRecognize = resolve;
    });
    await page.route("**/api/recognize", async (route: Route) => {
      await gate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ category: "Food", itemName: "Race Test Milk" }),
      });
    });

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    // Auto-recognize stays ON (default) — this race only exists on that path.
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-05.png")]);

    await expect(dialog.getByText("Recognizing…")).toBeVisible();
    // Pick the category by hand while the card is still recognizing; the AI
    // will later confirm the same category.
    await dialog.getByLabel("Item category").selectOption(String(food.id));
    await openDetails(dialog);

    const subcategoryTrigger = dialog.getByLabel("Item subcategory");
    await subcategoryTrigger.click();
    await page.getByRole("button", { name: "Dairy", exact: true }).click();
    await expect(subcategoryTrigger).toContainText("Dairy");

    // Release the gate: recognition now resolves, confirming the *same*
    // category (Food) the card already had.
    releaseRecognize();
    await expect(dialog.getByText("Recognizing…")).toHaveCount(0);

    await expect(dialog.getByLabel("Item name")).toHaveValue("Race Test Milk");
    // The bug this guards against: a same-category confirmation wiping the
    // subcategory back to its placeholder.
    await expect(subcategoryTrigger).toContainText("Dairy");
    await expect(subcategoryTrigger).not.toContainText("e.g. Dairy");
    await expect(dialog.getByLabel("Item category")).toHaveValue(String(food.id));
  });
});

/** Screenshot evidence for the Details/picker layout — examined and
 *  described in the ticket report, not just asserted present. */
test.describe("BulkAddItemsModal: Details field layout screenshots", () => {
  test("a ready card with Details open at 1280x800 and 375px", async ({ page }) => {
    await signup(page);
    const categories = await getCategories(page);
    const food = categories.find((c) => c.name === "Food")!;
    await stubUploadsSuccess(page);

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog.getByRole("switch", { name: /Auto-recognize/i }).click(); // OFF
    await dialog
      .locator('input[type="file"]')
      .setInputFiles([fixture("photo-01.png"), fixture("photo-02.png")]);
    await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 15000 });

    await dialog.getByLabel("Item name").first().fill("Whole Milk");
    await dialog.getByLabel("Item category").first().selectOption(String(food.id));
    await openDetails(dialog, 0);
    await dialog.getByLabel("Item location").first().fill("Kitchen → Fridge");

    await page.screenshot({
      path: "test-results/screenshots/t2-ready-card-fields-1280.png",
      fullPage: true,
    });

    await page.setViewportSize({ width: 375, height: 800 });
    await expect(dialog).toBeVisible();
    await page.screenshot({
      path: "test-results/screenshots/t2-ready-card-fields-375.png",
      fullPage: true,
    });
  });

  test("open subcategory picker panel at 1280x800 and 375px — not clipped, not painted under the modal, 'Add new subcategory' row legible", async ({
    page,
  }) => {
    await signup(page);
    await stubUploadsSuccess(page);

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog.getByRole("switch", { name: /Auto-recognize/i }).click(); // OFF
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-01.png")]);
    await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 15000 });

    await dialog.getByLabel("Item category").selectOption({ label: "Food" });
    await openDetails(dialog);
    await dialog.getByLabel("Item subcategory").click();
    const searchInput = page.getByPlaceholder("Search or add a subcategory…");
    await expect(searchInput).toBeVisible();
    // Type a non-matching query so the "Add new subcategory …" row (only
    // rendered when the typed text doesn't match an existing option) is
    // actually present for this screenshot, per decision 4's requirement
    // that it be legible.
    await searchInput.fill("Snacks");
    await expect(page.getByRole("button", { name: /Add new subcategory/ })).toBeVisible();
    // Not `fullPage: true`: the picker panel is `position: fixed` (portaled
    // to `document.body`, per OptionPicker's own docs), which a stitched
    // full-page capture can visually misplace relative to scrolled-past
    // content. A plain viewport screenshot matches what a real user on this
    // exact viewport actually sees.
    await page.screenshot({
      path: "test-results/screenshots/t2-subcategory-picker-open-1280.png",
    });

    await page.setViewportSize({ width: 375, height: 800 });
    await expect(searchInput).toBeVisible();
    await expect(page.getByRole("button", { name: /Add new subcategory/ })).toBeVisible();
    await page.screenshot({
      path: "test-results/screenshots/t2-subcategory-picker-open-375.png",
    });
  });
});

test.describe("BulkAddItemsModal: per-card failures, remove, retry", () => {
  test("a stubbed /api/uploads 400 puts that card in error with an inline message; other cards keep progressing", async ({
    page,
  }) => {
    await signup(page);
    const guard = guardNoItemCreation(page);
    await page.route("**/api/uploads", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "unsupported image type" }),
      }),
    );

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog.getByRole("switch", { name: /Auto-recognize/i }).click(); // OFF, isolate the upload stage

    // First card, alone, always hits the failing stub.
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-07.png")]);
    await expect(dialog.getByText("unsupported image type")).toBeVisible({ timeout: 15000 });
    await expect(dialog.getByRole("button", { name: "Retry" })).toHaveCount(0); // 400 is non-retryable
    await expect(dialog.getByRole("button", { name: "Remove", exact: true })).toBeVisible();

    // Now switch the stub to succeed and add four more — they must progress
    // normally, unaffected by the earlier failure.
    await page.unroute("**/api/uploads");
    await stubUploadsSuccess(page);
    await dialog
      .locator('input[type="file"]')
      .setInputFiles([
        fixture("photo-08.png"),
        fixture("photo-09.png"),
        fixture("photo-10.png"),
        fixture("photo-11.png"),
      ]);
    await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 15000 });
    // 1 error card (no name input) + 4 successful cards (name input each).
    await expect(dialog.getByLabel("Item name")).toHaveCount(4);
    await expect(dialog.locator('img[alt=""]')).toHaveCount(5);
    expect(guard.count()).toBe(0);
  });

  test("removing a card drops it from the list", async ({ page }) => {
    await signup(page);
    await stubUploadsSuccess(page);
    await page.route("**/api/recognize", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ category: "Food", itemName: "X" }) }),
    );

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog
      .locator('input[type="file"]')
      .setInputFiles([fixture("photo-14.png"), fixture("photo-15.png"), fixture("photo-16.png")]);
    await expect(dialog.locator('img[alt=""]')).toHaveCount(3);

    await dialog.getByRole("button", { name: "Remove photo" }).first().click();
    await expect(dialog.locator('img[alt=""]')).toHaveCount(2);
  });

  test("retrying a failed card re-runs it and succeeds against a now-healthy stub", async ({
    page,
  }) => {
    await signup(page);
    const guard = guardNoItemCreation(page);
    let shouldFail = true;
    await page.route("**/api/uploads", async (route: Route) => {
      if (shouldFail) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "internal server error" }),
        });
      } else {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ url: "/uploads/retried.jpg" }),
        });
      }
    });

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog.getByRole("switch", { name: /Auto-recognize/i }).click(); // OFF
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-17.png")]);

    await expect(dialog.getByText("internal server error")).toBeVisible({ timeout: 15000 });
    await expect(dialog.getByRole("button", { name: "Retry" })).toBeVisible(); // 500 is retryable

    shouldFail = false;
    await dialog.getByRole("button", { name: "Retry" }).click();
    await expect(dialog.getByText("internal server error")).toHaveCount(0, { timeout: 15000 });
    await expect(dialog.getByLabel("Item name")).toHaveCount(1);
    expect(guard.count()).toBe(0);
  });
});

test.describe("BulkAddItemsModal: 30-photo cap", () => {
  test("picking 35 files at once keeps 30 and reports the actual accepted count", async ({
    page,
  }) => {
    await signup(page);
    const guard = guardNoItemCreation(page);
    await stubUploadsSuccess(page);
    await page.route("**/api/recognize", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ category: "Food", itemName: "X" }) }),
    );

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);

    const files = Array.from({ length: 35 }, (_, i) =>
      fixture(`photo-${String(i + 1).padStart(2, "0")}.png`),
    );
    await dialog.locator('input[type="file"]').setInputFiles(files);

    await expect(dialog.locator('img[alt=""]')).toHaveCount(30);
    await expect(
      dialog.getByText("Kept the first 30 of 35 photos — commit these and start another batch."),
    ).toBeVisible();
    expect(guard.count()).toBe(0);
  });

  test("the cap is cumulative across two picks (28 existing + 10 more -> only 2 accepted, message reports 2)", async ({
    page,
  }) => {
    await signup(page);
    const guard = guardNoItemCreation(page);
    await stubUploadsSuccess(page);
    await page.route("**/api/recognize", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ category: "Food", itemName: "X" }) }),
    );

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);

    const first28 = Array.from({ length: 28 }, (_, i) =>
      fixture(`photo-${String(i + 1).padStart(2, "0")}.png`),
    );
    await dialog.locator('input[type="file"]').setInputFiles(first28);
    await expect(dialog.locator('img[alt=""]')).toHaveCount(28);

    const next10 = Array.from({ length: 10 }, (_, i) =>
      fixture(`photo-${String(i + 29).padStart(2, "0")}.png`),
    );
    await dialog.locator('input[type="file"]').setInputFiles(next10);

    await expect(dialog.locator('img[alt=""]')).toHaveCount(30);
    await expect(
      dialog.getByText("Kept the first 2 of 10 photos — commit these and start another batch."),
    ).toBeVisible();
    // Explicitly not the earlier bug's constant "30" message.
    await expect(dialog.getByText(/Kept the first 30 of 10/)).toHaveCount(0);
    expect(guard.count()).toBe(0);
  });
});

test.describe("BulkAddItemsModal: discard confirm and close paths", () => {
  test("an untouched, empty modal closes silently, no confirm", async ({ page }) => {
    await signup(page);
    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await expect(dialog).toBeVisible();

    await page.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(alertDialogWithText(page, "Discard this batch?")).toHaveCount(0);
  });

  test("closing with cards present raises the discard confirm; cancelling keeps every card and its typed name, no further network calls", async ({
    page,
  }) => {
    await signup(page);
    const guard = guardNoItemCreation(page);
    const uploads = stubUploadsSuccessTracked(page);
    await page.route("**/api/recognize", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ category: "Food", itemName: "X" }) }),
    );

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog.getByRole("switch", { name: /Auto-recognize/i }).click(); // OFF, fast settle
    await dialog
      .locator('input[type="file"]')
      .setInputFiles([fixture("photo-18.png"), fixture("photo-19.png")]);
    await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 15000 });

    await dialog.getByLabel("Item name").first().fill("Wool Sweater");

    const callsBeforeClose = uploads.count();
    await page.getByRole("button", { name: "Close" }).click();
    const confirmDialog = alertDialogWithText(page, "Discard this batch?");
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog).toContainText("2 photos");

    await confirmDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(confirmDialog).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('img[alt=""]')).toHaveCount(2);
    await expect(dialog.getByLabel("Item name").first()).toHaveValue("Wool Sweater");
    expect(uploads.count()).toBe(callsBeforeClose);
    expect(guard.count()).toBe(0);
  });

  test("confirming the discard closes the modal and stops further ingest scheduling (no new requests after confirm)", async ({
    page,
  }) => {
    await signup(page);
    const guard = guardNoItemCreation(page);
    let requestCount = 0;
    let releaseAll: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      releaseAll = resolve;
    });
    await page.route("**/api/uploads", async (route: Route) => {
      requestCount += 1;
      await gate;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ url: "/uploads/held.jpg" }),
      });
    });

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog.getByRole("switch", { name: /Auto-recognize/i }).click(); // OFF

    const files = Array.from({ length: 8 }, (_, i) =>
      fixture(`photo-${String(i + 20).padStart(2, "0")}.png`),
    );
    await dialog.locator('input[type="file"]').setInputFiles(files);

    // Concurrency cap means only 4 of the 8 have started.
    await expect.poll(() => requestCount, { timeout: 5000 }).toBe(4);

    // Type a name so hasUnsavedProgress is true even though every card is
    // still "uploading" (stage alone wouldn't be enough here).
    await dialog.getByLabel("Item name").first().fill("Typed while uploading");

    await page.getByRole("button", { name: "Close" }).click();
    const confirmDialog = alertDialogWithText(page, "Discard this batch?");
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Discard" }).click();
    await expect(dialog).toHaveCount(0);

    // Now release the 4 in-flight requests and give the (already-stopped)
    // pool every chance to have started more, if it were going to.
    releaseAll!();
    await page.waitForTimeout(1000);
    expect(requestCount).toBe(4);
    expect(guard.count()).toBe(0);
  });

  test("browser Back behaves the same as the X: raises the discard confirm, confirming closes the modal", async ({
    page,
  }) => {
    await signup(page);
    await stubUploadsSuccess(page);
    await page.route("**/api/recognize", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ category: "Food", itemName: "X" }) }),
    );

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog.getByRole("switch", { name: /Auto-recognize/i }).click(); // OFF
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-30.png")]);
    await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 15000 });

    await page.evaluate(() => window.history.back());
    const confirmDialog = alertDialogWithText(page, "Discard this batch?");
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Discard" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(confirmDialog).toHaveCount(0);
  });
});

/** Same as stubUploadsSuccess but exposes a live call counter. */
function stubUploadsSuccessTracked(page: Page): { count: () => number } {
  const state = { count: 0 };
  void page.route("**/api/uploads", async (route: Route) => {
    state.count += 1;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ url: `/uploads/tracked-${state.count}.jpg` }),
    });
  });
  return { count: () => state.count };
}

test.describe("BulkAddItemsModal: screenshots", () => {
  test("chooser sheet at 1280x800 and 375px", async ({ page }) => {
    await signup(page);
    await openChooserFromAllItems(page);
    await expect(chooserDialog(page)).toBeVisible();
    await page.screenshot({ path: "test-results/screenshots/chooser-1280.png" });

    await page.setViewportSize({ width: 375, height: 800 });
    await expect(chooserDialog(page)).toBeVisible();
    await page.screenshot({ path: "test-results/screenshots/chooser-375.png" });
  });

  test("review list mid-ingest, mixed card states, at 1280x800 and 375px", async ({ page }) => {
    await signup(page);
    const categories = await getCategories(page);
    const clothes = categories.find((c) => c.name === "Clothes")!;

    let uploadMode: "fail" | "hold" | "success" = "fail";
    const heldForever = new Promise<void>(() => {});
    let uploadN = 0;
    let heldUploadArrivals = 0;
    await page.route("**/api/uploads", async (route: Route) => {
      if (uploadMode === "hold") heldUploadArrivals += 1;
      if (uploadMode === "fail") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "unsupported image type" }),
        });
      } else if (uploadMode === "hold") {
        await heldForever;
      } else {
        uploadN += 1;
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ url: `/uploads/grid-${uploadN}.jpg` }),
        });
      }
    });

    let recognizeMode: "hold" | "success" = "hold";
    let heldRecognizeArrivals = 0;
    await page.route("**/api/recognize", async (route: Route) => {
      if (recognizeMode === "hold") {
        heldRecognizeArrivals += 1;
        await heldForever;
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ category: "Clothes", itemName: "Denim Jacket" }),
        });
      }
    });

    await openChooserFromCategoryPage(page, clothes.id);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    // Auto-recognize ON (default).

    // Card 1: upload fails -> error.
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-red.png")]);
    await expect(dialog.getByText("unsupported image type")).toBeVisible({ timeout: 15000 });

    // Card 2: upload hangs -> stuck "Uploading…".
    uploadMode = "hold";
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-blue.png")]);
    await expect(dialog.getByText("Uploading…")).toBeVisible({ timeout: 15000 });

    // The "Uploading…" label shows before the request reaches the route
    // handler; wait for card 2's request to be held before flipping the mode.
    await expect.poll(() => heldUploadArrivals, { timeout: 15000 }).toBe(1);

    // Card 3: upload succeeds, recognize hangs -> stuck "Recognizing…".
    uploadMode = "success";
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-green.png")]);
    await expect(dialog.getByText("Recognizing…")).toBeVisible({ timeout: 15000 });

    // Card 3's recognize request must have actually reached the route handler
    // (and been held) before we flip the mode, otherwise it could get the
    // success response too.
    await expect.poll(() => heldRecognizeArrivals, { timeout: 15000 }).toBe(1);

    // Card 4: upload + recognize succeed -> ready, prefilled with the AI's
    // name and category (sparkle). It's picked last, so among the name inputs
    // that exist (card 1 errored and has none), it's the last one.
    recognizeMode = "success";
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-yellow.png")]);
    await expect(dialog.getByLabel("Item name").last()).toHaveValue("Denim Jacket", {
      timeout: 15000,
    });

    await expect(dialog.locator('img[alt=""]')).toHaveCount(4);
    await expect(dialog.getByRole("img", { name: "Picked by AI" })).toHaveCount(1);
    await expect(dialog.getByLabel("Item category").last()).toHaveValue(String(clothes.id));

    await page.screenshot({
      path: "test-results/screenshots/bulk-list-mixed-1280.png",
      fullPage: true,
    });

    await page.setViewportSize({ width: 375, height: 800 });
    await expect(dialog).toBeVisible();
    await page.screenshot({
      path: "test-results/screenshots/bulk-list-mixed-375.png",
      fullPage: true,
    });
  });
});

test.describe("BulkAddItemsModal: regression — never creates real items", () => {
  test("a full pick/ingest/edit/remove/retry pass never calls POST /api/inventory/", async ({
    page,
  }) => {
    await signup(page);
    const guard = guardNoItemCreation(page);
    await stubUploadsSuccess(page);
    await page.route("**/api/recognize", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ category: "Food", itemName: "Canned Beans" }) }),
    );

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog
      .locator('input[type="file"]')
      .setInputFiles([fixture("photo-01.png"), fixture("photo-02.png"), fixture("photo-03.png")]);
    await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 15000 });
    await expect(dialog.getByText("Recognizing…")).toHaveCount(0, { timeout: 15000 });

    await dialog.getByLabel("Item name").first().fill("Edited Name");
    await dialog.getByRole("button", { name: "Remove photo" }).nth(1).click();

    expect(guard.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Bug-fix regression coverage (C1, C2, W2, W6, S1-S3): scroll-lock restore,
// browser-Back guard re-arm, beforeunload, footer segments, subcategory
// lookalike, cap/ note clearing.
// ---------------------------------------------------------------------------

/** Appends a tall spacer to <body> so the page behind the modal can scroll. */
async function makePageScrollable(page: Page): Promise<void> {
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.id = "test-scroll-spacer";
    spacer.style.height = "4000px";
    document.body.appendChild(spacer);
    window.scrollTo(0, 0);
  });
}

/** True when the page behind can actually be scrolled by the user (wheel). */
async function pageScrollsByWheel(page: Page): Promise<boolean> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(5, 300);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(300);
  return (await page.evaluate(() => window.scrollY)) > 0;
}

/** Opens bulk add on /items with N fixture photos, auto-recognize OFF. */
async function openBulkWithPhotos(page: Page, count: number): Promise<Locator> {
  await openChooserFromAllItems(page);
  await page.getByRole("button", { name: "Add multiple photos" }).click();
  const dialog = bulkDialog(page);
  await dialog.getByRole("switch", { name: /Auto-recognize/i }).click(); // OFF
  const files = Array.from({ length: count }, (_, i) =>
    fixture(`photo-${String(i + 1).padStart(2, "0")}.png`),
  );
  await dialog.locator('input[type="file"]').setInputFiles(files);
  await expect(dialog.getByTestId("bulk-card")).toHaveCount(count, { timeout: 15000 });
  await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 20000 });
  return dialog;
}

test.describe("BulkAddItemsModal: C1 scroll-lock restore after discard", () => {
  test("Go back (375px) -> Discard restores body overflow and the page scrolls again", async ({
    page,
  }) => {
    await signup(page);
    await stubUploadsSuccess(page);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/items");
    await makePageScrollable(page);
    await page.getByRole("button", { name: "Add item" }).click();
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog.getByRole("switch", { name: /Auto-recognize/i }).click();
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-01.png")]);
    await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 15000 });

    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await dialog.getByRole("button", { name: "Go back" }).click();
    const confirm = alertDialogWithText(page, "Discard this batch?");
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Discard" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(confirm).toHaveCount(0);

    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
    expect(await pageScrollsByWheel(page)).toBe(true);
  });

  test("Escape -> Discard (desktop) restores body overflow and the page scrolls again", async ({
    page,
  }) => {
    await signup(page);
    await stubUploadsSuccess(page);
    await page.goto("/items");
    await makePageScrollable(page);
    const dialog = await openBulkWithPhotosNoNav(page);

    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await page.keyboard.press("Escape");
    const confirm = alertDialogWithText(page, "Discard this batch?");
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Discard" }).click();
    await expect(dialog).toHaveCount(0);

    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
    expect(await pageScrollsByWheel(page)).toBe(true);
  });

  test("Cancelling the discard keeps the lock; a later Discard still restores it", async ({
    page,
  }) => {
    await signup(page);
    await stubUploadsSuccess(page);
    await page.goto("/items");
    const dialog = await openBulkWithPhotosNoNav(page);
    await page.keyboard.press("Escape");
    const confirm = alertDialogWithText(page, "Discard this batch?");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await page.keyboard.press("Escape");
    await confirm.getByRole("button", { name: "Discard" }).click();
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  });
});

/** Like openBulkWithPhotos(1) but assumes the page is already on /items. */
async function openBulkWithPhotosNoNav(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByRole("button", { name: "Add multiple photos" }).click();
  const dialog = bulkDialog(page);
  await dialog.getByRole("switch", { name: /Auto-recognize/i }).click();
  await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-01.png")]);
  await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 15000 });
  return dialog;
}

test.describe("BulkAddItemsModal: C2 browser Back guard re-arms after Cancel", () => {
  test("Back -> prompt (URL unchanged) -> Cancel -> Back again -> prompt again, cards intact -> Discard leaves cleanly", async ({
    page,
  }) => {
    await signup(page);
    await stubUploadsSuccess(page);
    await page.goto("/categories");
    await page.goto("/items");
    const urlBefore = page.url();
    const dialog = await openBulkWithPhotos(page, 2);
    await dialog.getByLabel("Item name").first().fill("Keep Me");
    expect(page.url()).toBe(urlBefore);

    const confirm = alertDialogWithText(page, "Discard this batch?");
    await page.goBack();
    await expect(confirm).toBeVisible();
    expect(page.url()).toBe(urlBefore);

    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(dialog.getByTestId("bulk-card")).toHaveCount(2);
    await expect(dialog.getByLabel("Item name").first()).toHaveValue("Keep Me");

    // Second Back must be intercepted again rather than leaving the page.
    await page.goBack();
    await expect(confirm).toBeVisible();
    expect(page.url()).toBe(urlBefore);
    await expect(dialog.getByTestId("bulk-card")).toHaveCount(2);
    await expect(dialog.getByLabel("Item name").first()).toHaveValue("Keep Me");

    await confirm.getByRole("button", { name: "Discard" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(confirm).toHaveCount(0);
    expect(page.url()).toBe(urlBefore);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  });
});

test.describe("BulkAddItemsModal: beforeunload only while progress exists", () => {
  /** Dispatches a cancelable beforeunload and reports whether it was vetoed. */
  const beforeUnloadVetoed = (page: Page) =>
    page.evaluate(() => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });

  test("not registered for an empty modal; registered once a photo is added; real reload raises the dialog", async ({
    page,
  }) => {
    await signup(page);
    await stubUploadsSuccess(page);
    await page.goto("/items");
    await page.getByRole("button", { name: "Add Item" }).click();
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await expect(dialog).toBeVisible();
    expect(await beforeUnloadVetoed(page)).toBe(false);

    await dialog.getByRole("switch", { name: /Auto-recognize/i }).click();
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-01.png")]);
    await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 15000 });
    expect(await beforeUnloadVetoed(page)).toBe(true);

    // Real navigation: a beforeunload dialog must show up on reload.
    const dialogs: string[] = [];
    page.on("dialog", async (d) => {
      dialogs.push(d.type());
      await d.accept();
    });
    await page.evaluate(() => document.body.click());
    await dialog.getByLabel("Item name").fill("x"); // user activation
    await page.reload();
    expect(dialogs).toContain("beforeunload");
  });

  test("an empty modal reloads without any beforeunload dialog", async ({ page }) => {
    await signup(page);
    await page.goto("/items");
    await page.getByRole("button", { name: "Add Item" }).click();
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    await expect(bulkDialog(page)).toBeVisible();
    const dialogs: string[] = [];
    page.on("dialog", async (d) => {
      dialogs.push(d.type());
      await d.accept();
    });
    await page.getByRole("button", { name: "Close" }).focus();
    await page.reload();
    expect(dialogs).toEqual([]);
  });

  test("after a successful commit the listener is gone (no veto, no dialog on reload)", async ({
    page,
  }) => {
    await signup(page);
    await stubUploadsSuccess(page);
    const categories = await getCategories(page);
    const food = categories.find((c) => c.name === "Food")!;
    await page.goto("/items");
    const dialog = await openBulkWithPhotosNoNav(page);
    await dialog.getByLabel("Item name").fill("Committed Thing");
    await dialog.getByLabel("Item category").selectOption(String(food.id));
    expect(await beforeUnloadVetoed(page)).toBe(true);
    await dialog.getByRole("button", { name: /^Add 1 Item$/ }).click();
    await expect(dialog).toHaveCount(0, { timeout: 15000 });

    expect(await beforeUnloadVetoed(page)).toBe(false);
    const dialogs: string[] = [];
    page.on("dialog", async (d) => {
      dialogs.push(d.type());
      await d.accept();
    });
    await page.reload();
    expect(dialogs).toEqual([]);
  });
});

test.describe("BulkAddItemsModal: S3 cap message clears, S2 note clears, W6/S1 subcategory", () => {
  test("30-card batch: cap message shows, removing one photo clears it", async ({ page }) => {
    await signup(page);
    await stubUploadsSuccess(page);
    await stubRecognize(page, 200, { category: "Food", itemName: "X" });
    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    const files = Array.from({ length: 33 }, (_, i) =>
      fixture(`photo-${String(i + 1).padStart(2, "0")}.png`),
    );
    await dialog.locator('input[type="file"]').setInputFiles(files);
    await expect(dialog.getByTestId("bulk-card")).toHaveCount(30);
    const msg = dialog.getByText(/Kept the first 30 of 33 photos/);
    await expect(msg).toBeVisible();

    await dialog.getByRole("button", { name: "Remove photo" }).first().click();
    await expect(dialog.getByTestId("bulk-card")).toHaveCount(29);
    await expect(msg).toHaveCount(0);
  });

  test("picking a category clears the recognition-failure note", async ({ page }) => {
    await signup(page);
    const categories = await getCategories(page);
    const food = categories.find((c) => c.name === "Food")!;
    await stubUploadsSuccess(page);
    await stubRecognize(page, 503, { error: "AI recognition is not configured" });
    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-01.png")]);
    const note = dialog.getByText("AI recognition is not configured");
    await expect(note).toBeVisible({ timeout: 15000 });
    await dialog.getByLabel("Item category").selectOption(String(food.id));
    await expect(note).toHaveCount(0);
  });

  test("subcategory shows 'Choose a category first' lookalike until a category is chosen, then the real picker (empty-state text per S1)", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    expect(categories.length).toBeGreaterThan(0);
    const created = await page.request.post("/api/categories/", { data: { name: "Gadgets" } });
    expect(created.ok()).toBe(true);
    const food = await created.json(); // brand-new category: no subcategories yet
    await stubUploadsSuccess(page);
    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog.getByRole("switch", { name: /Auto-recognize/i }).click();
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-01.png")]);
    await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 15000 });
    await openDetails(dialog);

    await expect(dialog.getByText("Choose a category first")).toBeVisible();
    await expect(dialog.getByLabel("Item subcategory")).toHaveCount(0);

    await dialog.getByLabel("Item category").selectOption(String(food.id));
    await expect(dialog.getByText("Choose a category first")).toHaveCount(0);
    const trigger = dialog.getByLabel("Item subcategory");
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.getByPlaceholder("Search or add a subcategory…")).toBeVisible();
    // Fresh user has no subcategories: the S1 empty-state hint is shown.
    await expect(page.getByText("No subcategories yet — type a name to add one.")).toBeVisible();
  });
});

test.describe("BulkAddItemsModal: W2 footer wraps only between segments at 375px", () => {
  test("each status segment is its own nowrap inline-block element and stays on one line", async ({
    page,
  }) => {
    await signup(page);
    await stubUploadsSuccess(page);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/items");
    await page.getByRole("button", { name: "Add item" }).click();
    await page.getByRole("button", { name: "Add multiple photos" }).click();
    const dialog = bulkDialog(page);
    await dialog.getByRole("switch", { name: /Auto-recognize/i }).click();
    const files = Array.from({ length: 14 }, (_, i) =>
      fixture(`photo-${String(i + 1).padStart(2, "0")}.png`),
    );
    await dialog.locator('input[type="file"]').setInputFiles(files);
    await expect(dialog.getByTestId("bulk-card")).toHaveCount(14);
    await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 20000 });

    const status = dialog.locator("p", { has: page.getByText(/^0 of 14 ready$/) });
    const segs = status.locator("span");
    await expect(segs).toHaveCount(3);
    await expect(segs.nth(0)).toHaveText("0 of 14 ready");
    await expect(segs.nth(1)).toHaveText("· 14 need a category");
    await expect(segs.nth(2)).toHaveText("· 14 need a name");

    const info = await segs.evaluateAll((els) =>
      els.map((el) => {
        const cs = getComputedStyle(el);
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
        return {
          ws: cs.whiteSpace,
          display: cs.display,
          rects: el.getClientRects().length,
          height: el.getBoundingClientRect().height,
          lh,
          top: Math.round(el.getBoundingClientRect().top),
        };
      }),
    );
    for (const s of info) {
      expect(s.ws).toBe("nowrap");
      expect(s.display).toBe("inline-block");
      expect(s.rects).toBe(1);
      expect(s.height).toBeLessThan(s.lh * 1.6); // single line, never broken mid-segment
    }
    // The line really does wrap at this width (so the test is meaningful).
    expect(new Set(info.map((s) => s.top)).size).toBeGreaterThan(1);
    await page.screenshot({ path: "test-results/footer-wrap-375.png" });
  });
});
