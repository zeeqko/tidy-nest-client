import { test, expect, type Page, type Route } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * T6 (verification only) coverage for PLAN.md's "bulk add items from a
 * multi-photo selection" plan.
 *
 * Proves the full pick -> ingest -> review -> commit loop holds together
 * against the *real* stack (real /api/uploads, real /api/inventory/) from
 * all three entry points, not just the individual phases T3/T4 each proved
 * in isolation. Per the plan's testing notes, /api/recognize is always
 * stubbed (never hits real Gemini) — everything else here is real.
 *
 * Per this file's own local-helper convention (no shared helpers module,
 * matching bulkAddModal.spec.ts / bulkAddCommit.spec.ts), all helpers live
 * below.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => path.join(__dirname, "fixtures", name);

let userCounter = 0;

/** Signs up a brand-new user for this test and leaves the page on "/". */
async function signup(page: Page): Promise<void> {
  userCounter += 1;
  const email = `bulk-e2e-${Date.now()}-${userCounter}@example.com`;
  const response = await page.request.post("/api/auth/signup", {
    data: { name: "Bulk E2E Tester", email, password: "password123" },
  });
  expect(response.ok()).toBe(true);
  await page.goto("/");
}

interface ApiCategoryLite {
  id: number;
  name: string;
  subCategories: { id: number; name: string }[];
}

/** Fetches this user's seeded categories via the API (name -> id lookup),
 *  rather than hardcoding ids, since they are DB auto-increment values. */
async function getCategories(page: Page): Promise<ApiCategoryLite[]> {
  const response = await page.request.get("/api/categories/");
  return response.json();
}

function byName(categories: ApiCategoryLite[], name: string): ApiCategoryLite {
  const found = categories.find((c) => c.name === name);
  if (!found) throw new Error(`Expected seeded category "${name}"`);
  return found;
}

/** Creates a brand-new, never-before-used category via the real API — the
 *  exact precondition T5's fix targets (no "General" subcategory pre-seeded
 *  under it, so the first bulk commit into it races to create one). */
async function createFreshCategory(page: Page, name: string): Promise<ApiCategoryLite> {
  const response = await page.request.post("/api/categories/", { data: { name } });
  expect(response.ok()).toBe(true);
  return response.json();
}

const dialogByTitle = (page: Page, title: string) => page.getByRole("dialog", { name: title });
const bulkDialog = (page: Page) => dialogByTitle(page, "Add Multiple Photos");
const itemFormDialog = (page: Page, title: "Add Item" | "Edit Item" = "Add Item") =>
  dialogByTitle(page, title);
// ModalShell's "alert" variant (AddItemChooser) has no accessible name via
// aria-label/aria-labelledby, so locate by role + visible text instead.
const alertDialogWithText = (page: Page, text: string | RegExp) =>
  page.getByRole("alertdialog").filter({ hasText: text });
const chooserDialog = (page: Page) => alertDialogWithText(page, "Add Items");
type Dialog = ReturnType<typeof bulkDialog>;

/** Tracks console errors and uncaught page errors (unhandled promise
 *  rejections surface here too) from the moment it's attached. Every test
 *  in this file asserts both are empty at the end.
 *
 *  Filters out Chromium's own "Failed to load resource: the server
 *  responded with a status of NNN" console entries — that's the browser
 *  logging a non-2xx fetch() response, not an application error, and this
 *  suite *deliberately* drives 503/500/400 responses (the degrade-cleanly
 *  and forced-failure cases) as first-class, correctly-handled outcomes.
 *  Any *other* console.error (a React warning, an uncaught exception logged
 *  by app code, etc.) still fails the assertion. */
function trackPageHealth(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    if (/^Failed to load resource: the server responded with a status of \d+/.test(msg.text())) {
      return;
    }
    consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });
  return { consoleErrors: () => consoleErrors, pageErrors: () => pageErrors };
}

/** Guards that no request to staticimgly.com and no PUT /api/inventory/:id
 *  ever fires — the cutout/background-removal pipeline must stay entirely
 *  out of bulk add, everywhere in this suite. */
function guardNoCutoutPipeline(page: Page) {
  const violations: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("staticimgly.com")) violations.push(`staticimgly request: ${url}`);
    try {
      const pathname = new URL(url).pathname;
      if (req.method() === "PUT" && /^\/api\/inventory\/[^/]+$/.test(pathname)) {
        violations.push(`PUT ${pathname}`);
      }
    } catch {
      // ignore unparseable URLs (none expected in this app)
    }
  });
  return () => violations;
}

/** /api/recognize stub returning a fixed category+name every time. */
function stubRecognizeMatching(page: Page, category: string, itemNamePrefix: string) {
  let n = 0;
  return page.route("**/api/recognize", async (route: Route) => {
    n += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ category, itemName: `${itemNamePrefix} ${n}` }),
    });
  });
}

/** /api/recognize stub that always 503s (no GEMINI_API_KEY on the
 *  deployment) — the degrade-cleanly path. */
function stubRecognize503(page: Page) {
  return page.route("**/api/recognize", async (route: Route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "AI recognition is not configured on this server." }),
    });
  });
}

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
async function openChooserFromBottomNav(page: Page, url: string): Promise<void> {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(url);
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(chooserDialog(page)).toBeVisible();
}

async function openBulkFrom(
  page: Page,
  entry: "allItems" | "categoryPage" | "bottomNav",
  categoryId?: number,
): Promise<Dialog> {
  if (entry === "allItems") await openChooserFromAllItems(page);
  else if (entry === "categoryPage") await openChooserFromCategoryPage(page, categoryId!);
  else await openChooserFromBottomNav(page, categoryId ? `/category/${categoryId}` : "/items");
  await page.getByRole("button", { name: "Add multiple photos" }).click();
  const dialog = bulkDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Turns the auto-recognize toggle off (default is ON). */
async function turnAutoRecognizeOff(dialog: Dialog): Promise<void> {
  const toggle = dialog.getByRole("switch", { name: /Auto-recognize/i });
  if ((await toggle.getAttribute("aria-checked")) === "true") {
    await toggle.click();
  }
}

/** Picks `files` (basenames under tests/fixtures/) into the bulk modal and
 *  waits for ingest to settle for all of them (no "Uploading…"/
 *  "Recognizing…" overlay left). */
async function pickAndWaitReady(dialog: Dialog, files: string[]): Promise<void> {
  await dialog.locator('input[type="file"]').setInputFiles(files.map(fixture));
  await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 20000 });
  await expect(dialog.getByText("Recognizing…")).toHaveCount(0, { timeout: 20000 });
}

/** Fills in a card's name by index (grid order == pick order). */
async function setName(dialog: Dialog, index: number, name: string): Promise<void> {
  await dialog.getByLabel("Item name").nth(index).fill(name);
}

const commitButton = (dialog: Dialog) => dialog.getByRole("button", { name: /^Add \d+ Items?$/ });

// ---------------------------------------------------------------------------

test.describe("T6: full lifecycle from each entry point (real backend)", () => {
  test("AllItemsPage, auto-recognize ON: items appear on /items without a manual reload", async ({
    page,
  }) => {
    const health = trackPageHealth(page);
    await signup(page);
    const cutoutGuard = guardNoCutoutPipeline(page);
    await stubRecognizeMatching(page, "Food", "Recognized Snack");

    const dialog = await openBulkFrom(page, "allItems");
    await pickAndWaitReady(dialog, ["photo-01.png", "photo-02.png"]);

    // Auto-recognize ON: names are prefilled, no typing needed. The two
    // ingest tasks run concurrently through the pool, so which photo's
    // recognize call lands first (and therefore which gets "... 1" vs
    // "... 2" from the stub's own call counter) isn't deterministic —
    // assert the *set* of prefilled names, not per-index values.
    await expect(dialog.getByLabel("Item name").nth(0)).not.toHaveValue("");
    await expect(dialog.getByLabel("Item name").nth(1)).not.toHaveValue("");
    const prefilledValues = await Promise.all(
      (await dialog.getByLabel("Item name").all()).map((el) => el.inputValue()),
    );
    expect(new Set(prefilledValues)).toEqual(new Set(["Recognized Snack 1", "Recognized Snack 2"]));
    await expect(dialog.getByText("2 of 2 ready", { exact: true })).toBeVisible();

    // Per-card categories: the AI matched "Food" for each photo, so every
    // card carries Food (set per card, not by any batch default) and shows
    // the "Picked by AI" sparkle.
    const food = byName(await getCategories(page), "Food");
    await expect(dialog.getByLabel("Item category")).toHaveCount(2);
    await expect(dialog.getByLabel("Item category").nth(0)).toHaveValue(String(food.id));
    await expect(dialog.getByLabel("Item category").nth(1)).toHaveValue(String(food.id));
    await expect(dialog.getByLabel("Picked by AI")).toHaveCount(2);

    await commitButton(dialog).click();
    await expect(dialog).toHaveCount(0, { timeout: 15000 });

    // Still on /items — no navigation, no reload — and the items are there.
    expect(page.url()).toContain("/items");
    await expect(page.getByText("Recognized Snack 1", { exact: true })).toBeVisible();
    await expect(page.getByText("Recognized Snack 2", { exact: true })).toBeVisible();

    expect(cutoutGuard()).toEqual([]);
    expect(health.consoleErrors()).toEqual([]);
    expect(health.pageErrors()).toEqual([]);
  });

  test("CategoryPage 'Add Item' pill, auto-recognize OFF: preselected category honoured, items appear on the category page without reload", async ({
    page,
  }) => {
    const health = trackPageHealth(page);
    await signup(page);
    const categories = await getCategories(page);
    const clothes = byName(categories, "Clothes");
    const cutoutGuard = guardNoCutoutPipeline(page);

    const dialog = await openBulkFrom(page, "categoryPage", clothes.id);
    await turnAutoRecognizeOff(dialog);
    await pickAndWaitReady(dialog, ["photo-03.png", "photo-04.png"]);

    await setName(dialog, 0, "Hand-Typed Cardigan");
    await setName(dialog, 1, "Hand-Typed Scarf");
    // Auto-recognize OFF + opened from a category page: new cards are
    // pre-seeded with the page's category, with no AI sparkle.
    await expect(dialog.getByLabel("Picked by AI")).toHaveCount(0);
    await expect(dialog.getByLabel("Item category").nth(0)).toHaveValue(String(clothes.id));
    await expect(dialog.getByLabel("Item category").nth(1)).toHaveValue(String(clothes.id));

    await commitButton(dialog).click();
    await expect(dialog).toHaveCount(0, { timeout: 15000 });

    expect(page.url()).toContain(`/category/${clothes.id}`);
    await expect(page.getByText("Hand-Typed Cardigan", { exact: true })).toBeVisible();
    await expect(page.getByText("Hand-Typed Scarf", { exact: true })).toBeVisible();

    expect(cutoutGuard()).toEqual([]);
    expect(health.consoleErrors()).toEqual([]);
    expect(health.pageErrors()).toEqual([]);
  });

  test("AppLayout bottom-nav '+' on /category/:id: preselects that category, reloadPage remounts the page and items appear without a manual reload", async ({
    page,
  }) => {
    const health = trackPageHealth(page);
    await signup(page);
    const categories = await getCategories(page);
    const makeup = byName(categories, "Makeup");
    const cutoutGuard = guardNoCutoutPipeline(page);

    const dialog = await openBulkFrom(page, "bottomNav", makeup.id);
    await turnAutoRecognizeOff(dialog);
    await pickAndWaitReady(dialog, ["photo-05.png", "photo-06.png"]);
    // OFF -> cards pre-seeded with the page category.
    await expect(dialog.getByLabel("Item category").nth(0)).toHaveValue(String(makeup.id));
    await expect(dialog.getByLabel("Item category").nth(1)).toHaveValue(String(makeup.id));
    await setName(dialog, 0, "Bottom Nav Blush");
    await setName(dialog, 1, "Bottom Nav Mascara");

    const urlBeforeCommit = page.url();
    await commitButton(dialog).click();
    await expect(dialog).toHaveCount(0, { timeout: 15000 });

    // AppLayout's onSaved is `reloadPage` (remounts the routed page via a
    // `key` bump), not a URL navigation — same URL, content refetched.
    expect(page.url()).toBe(urlBeforeCommit);
    await expect(page.getByText("Bottom Nav Blush", { exact: true })).toBeVisible();
    await expect(page.getByText("Bottom Nav Mascara", { exact: true })).toBeVisible();

    expect(cutoutGuard()).toEqual([]);
    expect(health.consoleErrors()).toEqual([]);
    expect(health.pageErrors()).toEqual([]);
  });
});

test.describe("T6: degrade-cleanly path (no GEMINI_API_KEY)", () => {
  test("auto-recognize ON but /api/recognize 503s for the whole batch: every card still lands ready with an advisory note, and hand-typed names commit successfully", async ({
    page,
  }) => {
    const health = trackPageHealth(page);
    await signup(page);
    const cutoutGuard = guardNoCutoutPipeline(page);
    await stubRecognize503(page);

    const dialog = await openBulkFrom(page, "allItems");
    await expect(dialog.getByRole("switch", { name: /Auto-recognize/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await pickAndWaitReady(dialog, ["photo-07.png", "photo-08.png", "photo-09.png"]);

    // Every card degrades to `ready` (not `error`) with an empty name and an
    // advisory note — recognition failing must never block the card.
    const nameInputs = dialog.getByLabel("Item name");
    await expect(nameInputs).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(nameInputs.nth(i)).toHaveValue("");
    }
    await expect(dialog.getByText("AI recognition is not configured on this server.")).toHaveCount(
      3,
    );
    // Not counted as failures — the summary line for failures never appears
    // pre-commit (only committedCount/commitFailedCount, both still 0 here).
    await expect(dialog.getByText(/added, .* failed/)).toHaveCount(0);

    // Recognition failed, so no category was chosen for any card: the
    // category select is unset ("Choose category"), no sparkle, and nothing
    // is committable yet.
    const categorySelects = dialog.getByLabel("Item category");
    for (let i = 0; i < 3; i++) {
      await expect(categorySelects.nth(i)).toHaveValue("");
    }
    await expect(dialog.getByLabel("Picked by AI")).toHaveCount(0);
    await expect(
      dialog.getByText("0 of 3 ready · 3 need a category · 3 need a name", { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Nothing to add yet" })).toBeDisabled();

    // The user picks a category and types a name per card.
    const clothes = byName(await getCategories(page), "Clothes");
    await setName(dialog, 0, "Manual Alpha");
    await setName(dialog, 1, "Manual Beta");
    await setName(dialog, 2, "Manual Gamma");
    // Named but still no category: still not committable.
    await expect(
      dialog.getByText("0 of 3 ready · 3 need a category", { exact: true }),
    ).toBeVisible();
    for (let i = 0; i < 3; i++) {
      await categorySelects.nth(i).selectOption(String(clothes.id));
    }
    await expect(dialog.getByText("3 of 3 ready", { exact: true })).toBeVisible();

    await commitButton(dialog).click();
    await expect(dialog).toHaveCount(0, { timeout: 15000 });

    for (const name of ["Manual Alpha", "Manual Beta", "Manual Gamma"]) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }

    expect(cutoutGuard()).toEqual([]);
    expect(health.consoleErrors()).toEqual([]);
    expect(health.pageErrors()).toEqual([]);
  });
});

test.describe("T6: T5 regression — same brand-new category, concurrent commits", () => {
  test("5 cards sharing one never-before-used category all commit successfully, with no unique-violation-shaped partial failure", async ({
    page,
  }) => {
    const health = trackPageHealth(page);
    await signup(page);
    const cutoutGuard = guardNoCutoutPipeline(page);
    const freshCategory = await createFreshCategory(page, `Fresh Category ${Date.now()}`);
    // Precondition check: this category genuinely has no subcategories yet
    // (in particular no "General"), which is exactly the state that used to
    // race under concurrent bulk commits before T5's fix.
    expect(freshCategory.subCategories).toEqual([]);

    await stubRecognize503(page); // irrelevant here, but keep real Gemini out of every spec

    const dialog = await openBulkFrom(page, "allItems");
    await turnAutoRecognizeOff(dialog);

    const files = ["photo-10.png", "photo-11.png", "photo-12.png", "photo-13.png", "photo-14.png"];
    await pickAndWaitReady(dialog, files);

    const names = ["Race A", "Race B", "Race C", "Race D", "Race E"];
    for (let i = 0; i < names.length; i++) {
      await setName(dialog, i, names[i]);
      // Auto-recognize is OFF, so each card starts unset; pick the fresh
      // category per card.
      await expect(dialog.getByLabel("Item category").nth(i)).toHaveValue("");
      await dialog.getByLabel("Item category").nth(i).selectOption(String(freshCategory.id));
    }
    await expect(dialog.getByText(`${names.length} of ${names.length} ready`, { exact: true })).toBeVisible();

    await commitButton(dialog).click();

    // On full success (T5's fix means every card should succeed) the modal
    // closes — no partial-failure summary, no leftover error card.
    await expect(dialog).toHaveCount(0, { timeout: 20000 });

    for (const name of names) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }

    // Concrete regression assertion: exactly one "General" subcategory now
    // exists under the fresh category, not one per racing commit.
    const categoriesAfter = await getCategories(page);
    const refreshed = categoriesAfter.find((c) => c.id === freshCategory.id)!;
    expect(refreshed.subCategories.length).toBe(1);
    expect(refreshed.subCategories[0].name).toBe("General");

    expect(cutoutGuard()).toEqual([]);
    expect(health.consoleErrors()).toEqual([]);
    expect(health.pageErrors()).toEqual([]);
  });
});

test.describe("T6: single-item flow regression (chooser's 'Add one item')", () => {
  test("AllItemsPage: no preselection, full submit creates the item and it appears without reload", async ({
    page,
  }) => {
    const health = trackPageHealth(page);
    await signup(page);
    const cutoutGuard = guardNoCutoutPipeline(page);

    await openChooserFromAllItems(page);
    await page.getByRole("button", { name: "Add one item" }).click();
    const form = itemFormDialog(page);
    await expect(form).toBeVisible();
    // No page category to preselect from -> defaults to the first category
    // in the dropdown (not asserting which one, just that something valid
    // is selected, matching this surface's documented lack of preselection).
    await expect(form.locator("select")).not.toHaveValue("");

    await form.getByLabel("Name").fill("Single Item From AllItems");
    await form.getByRole("button", { name: "Add Item" }).click();
    await expect(form).toHaveCount(0, { timeout: 10000 });

    expect(page.url()).toContain("/items");
    await expect(page.getByText("Single Item From AllItems", { exact: true })).toBeVisible();

    expect(cutoutGuard()).toEqual([]);
    expect(health.consoleErrors()).toEqual([]);
    expect(health.pageErrors()).toEqual([]);
  });

  test("CategoryPage: preselects that category, full submit creates the item on the category page without reload", async ({
    page,
  }) => {
    const health = trackPageHealth(page);
    await signup(page);
    const categories = await getCategories(page);
    const shoes = byName(categories, "Shoes");
    const cutoutGuard = guardNoCutoutPipeline(page);

    await openChooserFromCategoryPage(page, shoes.id);
    await page.getByRole("button", { name: "Add one item" }).click();
    const form = itemFormDialog(page);
    await expect(form).toBeVisible();
    await expect(form.locator("select")).toHaveValue(String(shoes.id));

    await form.getByLabel("Name").fill("Single Item From CategoryPage");
    await form.getByRole("button", { name: "Add Item" }).click();
    await expect(form).toHaveCount(0, { timeout: 10000 });

    expect(page.url()).toContain(`/category/${shoes.id}`);
    await expect(page.getByText("Single Item From CategoryPage", { exact: true })).toBeVisible();

    expect(cutoutGuard()).toEqual([]);
    expect(health.consoleErrors()).toEqual([]);
    expect(health.pageErrors()).toEqual([]);
  });

  test("AppLayout bottom-nav '+' on /category/:id: preselects that category, full submit creates the item without a manual reload", async ({
    page,
  }) => {
    const health = trackPageHealth(page);
    await signup(page);
    const categories = await getCategories(page);
    const books = byName(categories, "Books");
    const cutoutGuard = guardNoCutoutPipeline(page);

    await openChooserFromBottomNav(page, `/category/${books.id}`);
    await page.getByRole("button", { name: "Add one item" }).click();
    const form = itemFormDialog(page);
    await expect(form).toBeVisible();
    await expect(form.locator("select")).toHaveValue(String(books.id));

    await form.getByLabel("Name").fill("Single Item From BottomNav");
    const urlBeforeSave = page.url();
    await form.getByRole("button", { name: "Add Item" }).click();
    await expect(form).toHaveCount(0, { timeout: 10000 });

    expect(page.url()).toBe(urlBeforeSave);
    await expect(page.getByText("Single Item From BottomNav", { exact: true })).toBeVisible();

    expect(cutoutGuard()).toEqual([]);
    expect(health.consoleErrors()).toEqual([]);
    expect(health.pageErrors()).toEqual([]);
  });
});
