import { test, expect, type Page, type Route } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * T4 (commit pass on `BulkAddItemsModal.tsx` + `BulkAddCard.tsx`'s
 * `creating`/`done`/`error` states) coverage.
 *
 * Per PLAN.md's "bulk add items from a multi-photo selection" plan's T4
 * testing notes: `POST /api/inventory/` may run unstubbed against the real
 * backend for the happy-path/concurrency-cap cases; `/api/recognize` stays
 * stubbed always (here it's simply never exercised — every test turns the
 * auto-recognize toggle off, since T4 is about the commit pass, not
 * recognition); `/api/uploads` may run real. `POST /api/inventory/` is
 * stubbed only for the forced-failure and double-press cases.
 *
 * Real-backend multi-card commits always use *distinct* categories per card
 * (see PLAN.md's known T5 backend race on `ensureSubCategory` for a
 * never-before-used category under concurrent commits) so these specs never
 * trip it.
 *
 * Per this file's own local-helper convention (no shared helpers module),
 * all helpers live below, mirroring bulkAddModal.spec.ts's shape.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => path.join(__dirname, "fixtures", name);

let userCounter = 0;

/** Signs up a brand-new user for this test and leaves the page on "/". */
async function signup(page: Page): Promise<void> {
  userCounter += 1;
  const email = `bulk-commit-${Date.now()}-${userCounter}@example.com`;
  const response = await page.request.post("/api/auth/signup", {
    data: { name: "Bulk Commit Tester", email, password: "password123" },
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

function byName(categories: ApiCategoryLite[], name: string): ApiCategoryLite {
  const found = categories.find((c) => c.name === name);
  if (!found) throw new Error(`Expected seeded category "${name}"`);
  return found;
}

const dialogByTitle = (page: Page, title: string) => page.getByRole("dialog", { name: title });
const bulkDialog = (page: Page) => dialogByTitle(page, "Add Multiple Photos");
type Dialog = ReturnType<typeof bulkDialog>;
/** Matches `ConfirmDeleteModal`'s alertdialog role, same helper shape as
 *  bulkAddModal.spec.ts's own `alertDialogWithText`. */
const alertDialogWithText = (page: Page, text: string | RegExp) =>
  page.getByRole("alertdialog").filter({ hasText: text });

/** Opens the chooser + bulk modal from AllItemsPage's desktop "Add Item"
 *  pill (no category preselection). */
async function openBulkFromAllItems(page: Page): Promise<Dialog> {
  await page.goto("/items");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByRole("button", { name: "Add multiple photos" }).click();
  const dialog = bulkDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
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

/** Turns the auto-recognize toggle off (these specs are about commit, not
 *  recognition — every spec here keeps /api/recognize fully unexercised and
 *  instead picks a category per card via `setCard`, since with the toggle
 *  off every card starts at "Choose category"). */
async function turnAutoRecognizeOff(dialog: Dialog): Promise<void> {
  const toggle = dialog.getByRole("switch", { name: /Auto-recognize/i });
  if ((await toggle.getAttribute("aria-checked")) === "true") {
    await toggle.click();
  }
}

/** Picks `files` (basenames under tests/fixtures/) into the bulk modal and
 *  waits for ingest (upload-only, since recognize is off) to settle for all
 *  of them. */
async function pickAndWaitReady(dialog: Dialog, files: string[]): Promise<void> {
  await dialog.locator('input[type="file"]').setInputFiles(files.map(fixture));
  // Wait for every card row to exist first: "Uploading…" count 0 is trivially
  // true before any card has been added.
  await expect(dialog.getByTestId("bulk-card")).toHaveCount(files.length, { timeout: 15000 });
  await expect(dialog.getByText("Uploading…")).toHaveCount(0, { timeout: 15000 });
  await expect(dialog.getByText("Recognizing…")).toHaveCount(0, { timeout: 15000 });
}

/** Fills in a card's name + category by index (grid order == pick order). */
async function setCard(dialog: Dialog, index: number, name: string, categoryId: number): Promise<void> {
  await dialog.getByLabel("Item name").nth(index).fill(name);
  await dialog.getByLabel("Item category").nth(index).selectOption(String(categoryId));
}

const commitButton = (dialog: Dialog) => dialog.getByRole("button", { name: /^Add \d+ Items?$/ });

/** Tracks every real request matching `urlSubstring`, reporting peak
 *  concurrent in-flight requests (started but not yet finished/failed) —
 *  the plan's mandated technique for asserting the concurrency cap, as
 *  opposed to a total-count assertion. */
function trackConcurrency(page: Page, urlSubstring: string) {
  let inFlight = 0;
  let peak = 0;
  const matches = (url: string) => url.includes(urlSubstring);
  page.on("request", (req) => {
    if (matches(req.url())) {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
    }
  });
  page.on("requestfinished", (req) => {
    if (matches(req.url())) inFlight -= 1;
  });
  page.on("requestfailed", (req) => {
    if (matches(req.url())) inFlight -= 1;
  });
  return { peak: () => peak, inFlight: () => inFlight };
}

/** Guards that no request to staticimgly.com and no PUT /api/inventory/:id
 *  ever fires — the cutout pipeline must stay entirely out of bulk add. */
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

/** Counts GET /api/inventory/ (the list endpoint, exact path only — not
 *  GET /api/inventory/:id) so a spec can assert onSaved's refetch fired
 *  exactly once per commit pass, not once per created item. */
function countListInventoryGets(page: Page) {
  let count = 0;
  page.on("request", (req) => {
    if (req.method() !== "GET") return;
    try {
      if (new URL(req.url()).pathname === "/api/inventory/") count += 1;
    } catch {
      // ignore
    }
  });
  return () => count;
}

/** Captures every POST /api/inventory/ request body while still letting the
 *  request continue to the real backend. */
function captureCreatePayloads(page: Page) {
  const bodies: Record<string, unknown>[] = [];
  void page.route("**/api/inventory/", async (route: Route) => {
    const req = route.request();
    if (req.method() === "POST") {
      bodies.push(JSON.parse(req.postData() ?? "{}"));
    }
    await route.continue();
  });
  return bodies;
}

// ---------------------------------------------------------------------------

test.describe("BulkAddItemsModal commit: happy path against the real backend", () => {
  test("5 ready cards -> exactly 5 POST /api/inventory/, correct payload shape, items appear after modal closes", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const wanted = ["Food", "Clothes", "Makeup", "Shoes", "Bags"].map((n) => byName(categories, n));
    const cutoutGuard = guardNoCutoutPipeline(page);
    const payloads = captureCreatePayloads(page);

    const dialog = await openBulkFromAllItems(page);
    await turnAutoRecognizeOff(dialog);
    await pickAndWaitReady(dialog, [
      "photo-01.png",
      "photo-02.png",
      "photo-03.png",
      "photo-04.png",
      "photo-05.png",
    ]);

    const names = ["Sneakers", "Lipstick", "Granola", "Tote Bag", "Cardigan"];
    for (let i = 0; i < 5; i++) {
      await setCard(dialog, i, names[i], wanted[i].id);
    }

    await expect(dialog.getByText(/^5 of 5 ready$/)).toBeVisible();
    await commitButton(dialog).click();

    // On full success the modal closes.
    await expect(dialog).toHaveCount(0, { timeout: 15000 });

    // Exactly 5 creates.
    expect(payloads.length).toBe(5);

    for (let i = 0; i < 5; i++) {
      const p = payloads.find((b) => b.name === names[i]);
      expect(p, `payload for ${names[i]}`).toBeTruthy();
      expect(p!.category).toBe(wanted[i].name);
      // Per PLAN.md's "full-parity item fields in the bulk-add review grid"
      // (T2 tier-1, T3 tier-2): none of these are *unconditionally* their
      // old hardcoded values anymore — they're all now real, editable
      // per-card fields (see the "tier-1 fields" and "tier-2 fields" describe
      // blocks below). This still-unconditional assertion is correct here
      // specifically because `setCard` above never touches Subcategory/
      // Location/Quantity/Tags/Notes/dates for any of these 5 cards, and
      // every card's "Details" disclosure is left collapsed and
      // untouched — so they commit at T1's untouched defaults, same as
      // before this ticket, proving the disclosure hides fields without
      // altering their values.
      expect(p!.subcategory).toBe("");
      expect(p!.location).toBe("");
      expect(p!.notes).toBe("");
      expect(p!.quantity).toBe(1);
      expect(p!.tags).toEqual([]);
      expect(p!.opensOn).toBe("");
      expect(p!.expiryDate).toBe("");
      expect("cutoutURL" in p!).toBe(false);
    }

    // All 5 items now visible on the underlying AllItemsPage (onSaved's
    // refresh already ran before the modal closed).
    for (const name of names) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }

    expect(cutoutGuard()).toEqual([]);
  });
});

test.describe("BulkAddItemsModal commit: tier-1 fields (subcategory + location)", () => {
  test("typing a location and picking an existing subcategory commits those exact values, and a follow-up GET reflects them", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const food = byName(categories, "Food");
    const payloads = captureCreatePayloads(page);

    const dialog = await openBulkFromAllItems(page);
    await turnAutoRecognizeOff(dialog);
    await pickAndWaitReady(dialog, ["photo-01.png"]);
    await setCard(dialog, 0, "Yogurt", food.id);

    // Location and Subcategory both live inside the per-card "Details".
    await detailsToggle(dialog, 0).click();
    await dialog.getByLabel("Item location").fill("Kitchen -> Fridge");
    // Food's seeded subcategories are Dairy, Meat (default_categories.go) —
    // pick the real, existing one rather than typing a new one, so this
    // test proves the "select an existing option" path.
    await dialog.getByLabel("Item subcategory").click();
    await page.getByRole("button", { name: "Dairy", exact: true }).click();
    await expect(dialog.getByLabel("Item subcategory")).toContainText("Dairy");

    await commitButton(dialog).click();
    await expect(dialog).toHaveCount(0, { timeout: 15000 });

    expect(payloads.length).toBe(1);
    expect(payloads[0].name).toBe("Yogurt");
    expect(payloads[0].subcategory).toBe("Dairy");
    expect(payloads[0].location).toBe("Kitchen -> Fridge");

    // Assert on the created item itself (read path), not just the outgoing
    // request body.
    const items: Array<{ name: string; subcategory: string; location: string }> = await (
      await page.request.get("/api/inventory/")
    ).json();
    const created = items.find((it) => it.name === "Yogurt");
    expect(created, "created item").toBeTruthy();
    expect(created!.subcategory).toBe("Dairy");
    expect(created!.location).toBe("Kitchen -> Fridge");
  });

  test("creating a brand-new subcategory via the picker's 'Add new subcategory' row commits successfully and the subcategory appears under that card's category afterwards", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const clothes = byName(categories, "Clothes");

    const dialog = await openBulkFromAllItems(page);
    await turnAutoRecognizeOff(dialog);
    await pickAndWaitReady(dialog, ["photo-02.png"]);
    await setCard(dialog, 0, "Vintage Coat", clothes.id);
    await detailsToggle(dialog, 0).click();

    await dialog.getByLabel("Item subcategory").click();
    await page.getByPlaceholder("Search or add a subcategory…").fill("Vintage");
    await page.getByRole("button", { name: /Add new subcategory/ }).click();
    await expect(dialog.getByLabel("Item subcategory")).toContainText("Vintage");

    await commitButton(dialog).click();
    await expect(dialog).toHaveCount(0, { timeout: 15000 });

    const refreshed: Array<{ id: number; subCategories: Array<{ name: string }> }> = await (
      await page.request.get("/api/categories/")
    ).json();
    const clothesAfter = refreshed.find((c) => c.id === clothes.id);
    expect(clothesAfter, "clothes category after commit").toBeTruthy();
    expect(clothesAfter!.subCategories.some((sc) => sc.name === "Vintage")).toBe(true);
  });
});

/** Locates the nth card's "Details" disclosure toggle (list order == pick
 *  order, same convention as `setCard`). The button's name is always
 *  "Details"; open/closed state is carried by `aria-expanded`. */
const detailsToggle = (dialog: Dialog, index: number) =>
  dialog.getByRole("button", { name: "Details", exact: true }).nth(index);

test.describe("BulkAddItemsModal commit: tier-2 fields (quantity, tags, dates, notes, disclosure)", () => {
  test("expanding a card reveals quantity/tags/dates/notes; filling all five and committing sends exactly those values, and a follow-up GET reflects them", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const food = byName(categories, "Food");
    const payloads = captureCreatePayloads(page);

    const dialog = await openBulkFromAllItems(page);
    await turnAutoRecognizeOff(dialog);
    await pickAndWaitReady(dialog, ["photo-01.png"]);
    await setCard(dialog, 0, "Oat Milk", food.id);

    // Collapsed by default — none of the tier-2 fields are attached yet.
    await expect(dialog.getByLabel("Item quantity")).toHaveCount(0);
    await expect(detailsToggle(dialog, 0)).toHaveAttribute("aria-expanded", "false");

    await detailsToggle(dialog, 0).click();
    await expect(detailsToggle(dialog, 0)).toHaveAttribute("aria-expanded", "true");

    await dialog.getByLabel("Item quantity").fill("4");

    // "Fresh"/"Frozen" are pre-seeded global tags (default_categories.go) —
    // use a genuinely new name so the picker offers "Add new tag" rather
    // than an existing-option row.
    await dialog.getByLabel("Item tags").click();
    await page.getByPlaceholder("Search or add a tag…").fill("MealPrep");
    await page.getByRole("button", { name: /Add new tag/ }).click();
    await page.keyboard.press("Escape");
    await expect(dialog.getByLabel("Item tags")).toContainText("MealPrep");

    await dialog.getByLabel("Item opened on").fill("2026-01-05");
    await dialog.getByLabel("Item expiry date").fill("2026-02-01");
    await dialog.getByLabel("Item notes").fill("Keep away from the door shelf");

    await commitButton(dialog).click();
    await expect(dialog).toHaveCount(0, { timeout: 15000 });

    expect(payloads.length).toBe(1);
    const p = payloads[0];
    expect(p.name).toBe("Oat Milk");
    expect(p.quantity).toBe(4);
    expect(p.tags).toEqual([{ name: "MealPrep" }]);
    expect(p.opensOn).toBe("2026-01-05");
    expect(p.expiryDate).toBe("2026-02-01");
    expect(p.notes).toBe("Keep away from the door shelf");

    const items: Array<{
      name: string;
      quantity: number;
      tags: Array<{ name: string }>;
      opensOn: string;
      expiryDate: string;
      notes: string;
    }> = await (await page.request.get("/api/inventory/")).json();
    const created = items.find((it) => it.name === "Oat Milk");
    expect(created, "created item").toBeTruthy();
    expect(created!.quantity).toBe(4);
    expect(created!.tags.map((t) => t.name)).toEqual(["MealPrep"]);
    expect(created!.opensOn).toBe("2026-01-05");
    expect(created!.expiryDate).toBe("2026-02-01");
    expect(created!.notes).toBe("Keep away from the door shelf");
  });

  test("a Food card's Details disclosure starts collapsed — the deliberate divergence from ItemFormModal's reminderOnExpiry auto-open", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const food = byName(categories, "Food");
    expect(food).toBeTruthy(); // Food is seeded with reminderOnExpiry: true

    const dialog = await openBulkFromAllItems(page);
    await turnAutoRecognizeOff(dialog);
    await pickAndWaitReady(dialog, ["photo-01.png"]);
    await setCard(dialog, 0, "Yogurt", food.id);

    // Still collapsed even though Food tracks expiry by default — bulk cards
    // never auto-open the disclosure, regardless of category.
    await expect(detailsToggle(dialog, 0)).toHaveAttribute("aria-expanded", "false");
    await expect(dialog.getByLabel("Item opened on")).toHaveCount(0);
    await expect(dialog.getByLabel("Item expiry date")).toHaveCount(0);
  });

  test("a card left collapsed and untouched commits with T1's defaults, proving the disclosure hides fields without altering their values", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const food = byName(categories, "Food");
    const payloads = captureCreatePayloads(page);

    const dialog = await openBulkFromAllItems(page);
    await turnAutoRecognizeOff(dialog);
    await pickAndWaitReady(dialog, ["photo-01.png"]);
    await setCard(dialog, 0, "Plain Yogurt", food.id);

    await commitButton(dialog).click();
    await expect(dialog).toHaveCount(0, { timeout: 15000 });

    expect(payloads.length).toBe(1);
    expect(payloads[0].quantity).toBe(1);
    expect(payloads[0].tags).toEqual([]);
    expect(payloads[0].notes).toBe("");
    expect(payloads[0].opensOn).toBe("");
    expect(payloads[0].expiryDate).toBe("");
  });

  test("quantity clamps to 1 on blur for empty/0/non-numeric input and preserves a valid value", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const food = byName(categories, "Food");

    const dialog = await openBulkFromAllItems(page);
    await turnAutoRecognizeOff(dialog);
    await pickAndWaitReady(dialog, ["photo-01.png"]);
    await setCard(dialog, 0, "Whatever", food.id);
    await detailsToggle(dialog, 0).click();

    const quantity = dialog.getByLabel("Item quantity");

    await quantity.fill("");
    await quantity.blur();
    await expect(quantity).toHaveValue("1");

    await quantity.fill("0");
    await quantity.blur();
    await expect(quantity).toHaveValue("1");

    await quantity.fill("7");
    await quantity.blur();
    await expect(quantity).toHaveValue("7");
  });

  test("creating a brand-new tag via the picker commits successfully and links the tag to that card's category", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const clothes = byName(categories, "Clothes");

    const dialog = await openBulkFromAllItems(page);
    await turnAutoRecognizeOff(dialog);
    await pickAndWaitReady(dialog, ["photo-02.png"]);
    await setCard(dialog, 0, "Vintage Coat", clothes.id);
    await detailsToggle(dialog, 0).click();

    await dialog.getByLabel("Item tags").click();
    await page.getByPlaceholder("Search or add a tag…").fill("Retro");
    await page.getByRole("button", { name: /Add new tag/ }).click();
    await page.keyboard.press("Escape");
    await expect(dialog.getByLabel("Item tags")).toContainText("Retro");

    await commitButton(dialog).click();
    await expect(dialog).toHaveCount(0, { timeout: 15000 });

    const refreshed: Array<{ id: number; tags: Array<{ name: string }> }> = await (
      await page.request.get("/api/categories/")
    ).json();
    const clothesAfter = refreshed.find((c) => c.id === clothes.id);
    expect(clothesAfter, "clothes category after commit").toBeTruthy();
    expect(clothesAfter!.tags.some((t) => t.name === "Retro")).toBe(true);
  });

  test("committing several cards that share one brand-new tag name (identical casing) succeeds for every card with no partial-failure summary — the ensureTag concurrency race, run unstubbed at the real commit concurrency", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    // Distinct categories per card, per this file's own convention (see the
    // top-of-file docstring) — the only never-before-used-name race this
    // suite otherwise has to avoid is ensureSubCategory's, which needs a
    // brand-new *category*, not a brand-new tag; every category name used
    // here is already seeded, so that race is not in play. What *is* in play
    // is ensureTag's: five cards racing to create the exact same brand-new
    // tag name at once, at the real default commit concurrency of 4.
    const wanted = ["Food", "Clothes", "Makeup", "Shoes", "Bags"].map((n) => byName(categories, n));
    const payloads = captureCreatePayloads(page);

    const dialog = await openBulkFromAllItems(page);
    await turnAutoRecognizeOff(dialog);
    await pickAndWaitReady(dialog, [
      "photo-01.png",
      "photo-02.png",
      "photo-03.png",
      "photo-04.png",
      "photo-05.png",
    ]);

    const names = ["Race A", "Race B", "Race C", "Race D", "Race E"];
    for (let i = 0; i < 5; i++) {
      await setCard(dialog, i, names[i], wanted[i].id);
      await detailsToggle(dialog, i).click();
      await dialog.getByLabel("Item tags").nth(i).click();
      await page.getByPlaceholder("Search or add a tag…").fill("SharedHaul");
      await page.getByRole("button", { name: /Add new tag/ }).click();
      await page.keyboard.press("Escape");
      await expect(dialog.getByLabel("Item tags").nth(i)).toContainText("SharedHaul");
    }

    await expect(dialog.getByText(/^5 of 5 ready$/)).toBeVisible();
    await commitButton(dialog).click();

    // Full success: modal closes, no partial-failure summary ever appears.
    await expect(dialog).toHaveCount(0, { timeout: 15000 });
    expect(payloads.length).toBe(5);
    for (const name of names) {
      const p = payloads.find((b) => b.name === name);
      expect(p, `payload for ${name}`).toBeTruthy();
      expect(p!.tags).toEqual([{ name: "SharedHaul" }]);
    }

    const items: Array<{ name: string; tags: Array<{ name: string }> }> = await (
      await page.request.get("/api/inventory/")
    ).json();
    for (const name of names) {
      const created = items.find((it) => it.name === name);
      expect(created, `created item ${name}`).toBeTruthy();
      expect(created!.tags.map((t) => t.name)).toEqual(["SharedHaul"]);
    }
  });
});

test.describe("BulkAddItemsModal commit: Tags picker Escape/close-guard (idempotent tracking, T3's extension of T2's mechanism)", () => {
  test("Escape with the Tags picker open closes only the picker; a second, picker-free Escape raises the discard confirm", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const food = byName(categories, "Food");

    const dialog = await openBulkFromAllItems(page);
    await turnAutoRecognizeOff(dialog);
    await pickAndWaitReady(dialog, ["photo-01.png"]);
    await setCard(dialog, 0, "Yogurt", food.id);
    await detailsToggle(dialog, 0).click();

    await dialog.getByLabel("Item tags").click();
    const searchInput = page.getByPlaceholder("Search or add a tag…");
    await expect(searchInput).toBeVisible();

    // First Escape: the Tags picker absorbs it and closes — same guard key
    // shape as Subcategory's (`${cardId}:tags` vs `${cardId}:subcategory`),
    // so the modal's own discard confirm must not appear yet.
    await page.keyboard.press("Escape");
    await expect(searchInput).toHaveCount(0);
    await expect(alertDialogWithText(page, "Discard this batch?")).toHaveCount(0);
    await expect(dialog).toBeVisible();

    // Second, picker-free Escape: now the modal's own close guard fires.
    await page.keyboard.press("Escape");
    await expect(alertDialogWithText(page, "Discard this batch?")).toBeVisible();
  });

  test("one card's Subcategory picker and a different card's Tags picker open at the same time — closing one via its own toggle does not clobber the other's guard entry", async ({
    page,
  }) => {
    // `OptionPicker` portals a full-viewport overlay while open
    // (`onPointerDown={() => setOpen(false)}`), so a *pointer* click on a
    // second, different trigger while one picker is already open just closes
    // the first one — real users can never get two pickers open via mouse
    // clicks alone, confirmed by direct experimentation against the dev
    // server before writing this test. Focusing the second trigger with the
    // keyboard and activating it with Enter bypasses that overlay (native
    // button keydown activation, not a pointer event), which is what this
    // test uses to get both genuinely open at once — the only way to
    // actually exercise two simultaneous guard entries.
    await signup(page);
    const categories = await getCategories(page);
    const food = byName(categories, "Food");
    const clothes = byName(categories, "Clothes");

    const dialog = await openBulkFromAllItems(page);
    await turnAutoRecognizeOff(dialog);
    await pickAndWaitReady(dialog, ["photo-01.png", "photo-02.png"]);
    await setCard(dialog, 0, "Yogurt", food.id);
    await setCard(dialog, 1, "Cardigan", clothes.id);
    await detailsToggle(dialog, 1).click(); // expand only card 1, for its Tags field

    const subcategoryTrigger = dialog.getByLabel("Item subcategory").first();
    const tagsTrigger = dialog.getByLabel("Item tags");
    const subcategorySearch = page.getByPlaceholder("Search or add a subcategory…");
    const tagSearch = page.getByPlaceholder("Search or add a tag…");
    const discardConfirm = alertDialogWithText(page, "Discard this batch?");

    // Open card 0's Subcategory picker (T2's key, "0:subcategory") via a
    // normal click.
    await subcategoryTrigger.click();
    await expect(subcategorySearch).toBeVisible();

    // Open card 1's Tags picker (T3's key, "1:tags") via keyboard activation
    // while Subcategory's is still open — both are now genuinely open at
    // once, proving the guard holds two distinct entries simultaneously.
    await tagsTrigger.focus();
    await page.keyboard.press("Enter");
    await expect(tagSearch).toBeVisible();
    await expect(subcategorySearch).toBeVisible();

    // Close *only* Tags, via its own trigger's native keyboard toggle (not
    // Escape, which — per OptionPicker's own per-instance keydown effect —
    // would close every currently-open picker in one press, useless for
    // isolating one from the other). If Tags and Subcategory ever shared a
    // guard key (or a card-id got dropped from the key), this close would
    // incorrectly clear Subcategory's entry too.
    await tagsTrigger.focus();
    await page.keyboard.press("Enter");
    await expect(tagSearch).toHaveCount(0);
    await expect(subcategorySearch).toBeVisible(); // untouched by Tags closing
    await expect(discardConfirm).toHaveCount(0);

    // Escape now closes Subcategory (the only picker left open). Critically,
    // `ModalShell`'s own Escape listener evaluates `closeGuard()`
    // *synchronously*, before `OptionPicker`'s just-triggered close has had
    // a chance to flush its own `onOpenChange` effect — so this assertion
    // only holds if Subcategory's guard entry was never prematurely removed
    // by Tags closing a moment ago. A shared-key bug would have already
    // emptied the guard early, and this exact Escape press would incorrectly
    // raise the discard confirm one press too soon.
    await page.keyboard.press("Escape");
    await expect(subcategorySearch).toHaveCount(0);
    await expect(discardConfirm).toHaveCount(0);
    await expect(dialog).toBeVisible();

    // Only now, with both pickers genuinely closed, does a picker-free
    // Escape reach the modal's own close guard.
    await page.keyboard.press("Escape");
    await expect(discardConfirm).toBeVisible();
  });
});

/** Screenshot evidence for the compact per-photo row layout — examined and
 *  described in the ticket report, not just asserted present. Persisted
 *  under `test-results/screenshots/` with a `t7-` prefix. */
test.describe("BulkAddItemsModal commit: compact-row layout screenshots", () => {
  test("one expanded Details card, all fields, at 1280x800 and 375px", async ({ page }) => {
    await signup(page);
    const categories = await getCategories(page);
    const clothes = byName(categories, "Clothes");

    const dialog = await openBulkFromAllItems(page);
    await turnAutoRecognizeOff(dialog);
    await pickAndWaitReady(dialog, ["photo-01.png"]);
    await setCard(dialog, 0, "Vintage Coat", clothes.id);

    await detailsToggle(dialog, 0).click();
    await dialog.getByLabel("Item location").fill("Hall Closet");
    await dialog.getByLabel("Item quantity").fill("2");

    await dialog.getByLabel("Item tags").click();
    for (const t of ["Winter", "Vintage", "Statement Piece"]) {
      await page.getByPlaceholder("Search or add a tag…").fill(t);
      const exact = page.getByRole("button", { name: t, exact: true });
      if (await exact.count()) {
        await exact.click();
      } else {
        await page.getByRole("button", { name: /Add new tag/ }).click();
      }
    }
    await page.keyboard.press("Escape");

    await dialog.getByLabel("Item opened on").fill("2026-01-05");
    await dialog.getByLabel("Item expiry date").fill("2026-06-01");
    await dialog
      .getByLabel("Item notes")
      .fill("A longer note to check the textarea wraps and does not overflow the card boundary.");

    // Fields are all present in the expanded row.
    for (const label of [
      "Item name",
      "Item category",
      "Item subcategory",
      "Item location",
      "Item quantity",
      "Item tags",
      "Item opened on",
      "Item expiry date",
      "Item notes",
    ]) {
      await expect(dialog.getByLabel(label)).toBeVisible();
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: "test-results/screenshots/t7-expanded-card-1280.png" });

    await page.setViewportSize({ width: 375, height: 1100 });
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: "test-results/screenshots/t7-expanded-card-375.png" });
  });

  test("mixed expanded/collapsed list with footer status at 1280x800 and 375x800", async ({ page }) => {
    await signup(page);
    const categories = await getCategories(page);
    const food = byName(categories, "Food");
    const clothes = byName(categories, "Clothes");

    const dialog = await openBulkFromAllItems(page);
    await turnAutoRecognizeOff(dialog);
    await pickAndWaitReady(dialog, ["photo-01.png", "photo-02.png", "photo-03.png"]);
    await setCard(dialog, 0, "Yogurt", food.id);
    await setCard(dialog, 1, "Cardigan", clothes.id);
    // Card 2 stays with no name and no category (danger pill).

    await detailsToggle(dialog, 0).click();
    await detailsToggle(dialog, 1).click();
    await expect(detailsToggle(dialog, 0)).toHaveAttribute("aria-expanded", "true");
    await expect(detailsToggle(dialog, 1)).toHaveAttribute("aria-expanded", "true");
    await expect(detailsToggle(dialog, 2)).toHaveAttribute("aria-expanded", "false");
    await expect(dialog.getByText("2 of 3 ready · 1 need a category · 1 need a name")).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 1300 });
    await page.screenshot({ path: "test-results/screenshots/t7-mixed-list-1280.png" });

    await page.setViewportSize({ width: 375, height: 800 });
    await expect(dialog).toBeVisible();
    await expect(commitButton(dialog)).toBeVisible(); // sticky footer still in view
    await page.screenshot({ path: "test-results/screenshots/t7-mixed-list-375.png" });
  });

  test("collapsed ready row (Food) stays collapsed, with no tier-2 fields (screenshot)", async ({ page }) => {
    await signup(page);
    const categories = await getCategories(page);
    const food = byName(categories, "Food");

    const dialog = await openBulkFromAllItems(page);
    await turnAutoRecognizeOff(dialog);
    await pickAndWaitReady(dialog, ["photo-01.png"]);
    await setCard(dialog, 0, "Milk", food.id);

    await expect(detailsToggle(dialog, 0)).toHaveAttribute("aria-expanded", "false");
    await expect(dialog.getByLabel("Item quantity")).toHaveCount(0);

    await page.screenshot({ path: "test-results/screenshots/t7-food-collapsed-1280.png" });
  });
});

test.describe("BulkAddItemsModal commit: concurrency cap", () => {
  test("concurrent in-flight commit requests never exceed 4", async ({ page }) => {
    await signup(page);
    const categories = await getCategories(page);
    const food = byName(categories, "Food");
    await stubUploadsSuccess(page);
    const concurrency = trackConcurrency(page, "/api/inventory/");

    // Hold every POST /api/inventory/ open forever; GET (mount refetch,
    // etc.) is left to fall through untouched.
    const neverResolve = new Promise<void>(() => {});
    await page.route("**/api/inventory/", async (route: Route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await neverResolve;
    });

    const dialog = await openBulkFromAllItems(page);
    await turnAutoRecognizeOff(dialog);
    const files = Array.from({ length: 6 }, (_, i) => `photo-${String(i + 1).padStart(2, "0")}.png`);
    await pickAndWaitReady(dialog, files);
    for (let i = 0; i < 6; i++) {
      await setCard(dialog, i, `Thing ${i}`, food.id);
    }

    await commitButton(dialog).click();

    await expect.poll(() => concurrency.inFlight(), { timeout: 5000 }).toBe(4);
    await page.waitForTimeout(500);
    expect(concurrency.inFlight()).toBe(4);
    expect(concurrency.peak()).toBe(4);
  });
});

test.describe("BulkAddItemsModal commit: blank name / no category are excluded, others commit", () => {
  test("a blank-name card and a no-category card are not sent and are marked inline while the other cards commit normally", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const food = byName(categories, "Food");
    const clothes = byName(categories, "Clothes");
    const cutoutGuard = guardNoCutoutPipeline(page);
    const payloads = captureCreatePayloads(page);

    const dialog = await openBulkFromAllItems(page);
    await turnAutoRecognizeOff(dialog);
    await pickAndWaitReady(dialog, ["photo-01.png", "photo-02.png", "photo-03.png", "photo-04.png"]);

    await setCard(dialog, 0, "Item A", food.id);
    // Card 1 deliberately left with a blank name (category picked).
    await dialog.getByLabel("Item category").nth(1).selectOption(String(food.id));
    await setCard(dialog, 2, "Item C", clothes.id);
    // Card 3 has a name but deliberately no category ("Choose category").
    await dialog.getByLabel("Item name").nth(3).fill("Item D");
    await expect(dialog.getByLabel("Item category").nth(3)).toHaveValue("");

    // Danger markers: an untouched blank name stays neutral; once focused and
    // blurred it gets aria-invalid. The unset category is marked immediately.
    await expect(dialog.getByLabel("Item name").nth(1)).not.toHaveAttribute("aria-invalid", "true");
    await dialog.getByLabel("Item name").nth(1).focus();
    await dialog.getByLabel("Item name").nth(1).blur();
    await expect(dialog.getByLabel("Item name").nth(1)).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByLabel("Item category").nth(3)).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByLabel("Item name").nth(0)).not.toHaveAttribute("aria-invalid", "true");

    // Footer: ready / need a category / need a name.
    await expect(dialog.getByText("2 of 4 ready · 1 need a category · 1 need a name")).toBeVisible();
    await expect(commitButton(dialog)).toHaveText("Add 2 Items");

    await commitButton(dialog).click();

    // Wait for the pass to settle: the two committed cards drop out of the
    // list, leaving exactly the blank-name card and the no-category card.
    await expect(dialog.getByLabel("Item name")).toHaveCount(2, { timeout: 15000 });

    expect(payloads.length).toBe(2);
    expect(payloads.some((p) => p.name === "Item A")).toBe(true);
    expect(payloads.some((p) => p.name === "Item C")).toBe(true);
    expect(payloads.some((p) => p.name === "Item D")).toBe(false);

    // *** Critical-bug regression case ***: even though both committed cards
    // succeeded, the modal must stay open because the two excluded cards are
    // still in the list, interactable (not disabled), still marked.
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Item name").nth(0)).toBeEnabled();
    await expect(dialog.getByLabel("Item name").nth(0)).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByLabel("Item category").nth(1)).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByLabel("Item category").nth(1)).toBeEnabled();
    await expect(dialog.getByText("0 of 2 ready · 1 need a category · 1 need a name")).toBeVisible();
    await expect(commitButton(dialog)).toHaveCount(0); // "Nothing to add yet", disabled
    await expect(dialog.getByRole("button", { name: "Nothing to add yet" })).toBeDisabled();
    await expect(dialog.getByText(/added, \d+ failed/)).toHaveCount(0); // never sent, so not a failure

    expect(cutoutGuard()).toEqual([]);
  });
});

test.describe("BulkAddItemsModal commit: Critical-bug regression — a still-ingesting card keeps the modal open", () => {
  test("committing while another card is still mid-ingest leaves the modal open with that card still visible and interactable", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const food = byName(categories, "Food");
    const payloads = captureCreatePayloads(page);

    const dialog = await openBulkFromAllItems(page);
    await turnAutoRecognizeOff(dialog);

    // Card A: real upload, becomes ready immediately.
    await pickAndWaitReady(dialog, ["photo-01.png"]);
    await setCard(dialog, 0, "Ready Item", food.id);

    // Card B: /api/uploads now held open forever, so it stays stuck in
    // "uploading" no matter how long we wait.
    const neverResolve = new Promise<void>(() => {});
    await page.route("**/api/uploads", async () => {
      await neverResolve;
    });
    await dialog.locator('input[type="file"]').setInputFiles([fixture("photo-02.png")]);
    await expect(dialog.getByText("Uploading…")).toBeVisible();

    // Only card A is committable.
    await expect(dialog.getByText(/^1 of 2 ready · 1 processing$/)).toBeVisible();
    await commitButton(dialog).click();

    // Card A's card drops out of the grid; card B (still uploading) remains.
    await expect(dialog.getByText("Uploading…")).toBeVisible({ timeout: 15000 });
    expect(payloads.length).toBe(1);
    expect(payloads[0].name).toBe("Ready Item");

    // Regression assertion: modal stays open, mid-ingest card still present.
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Uploading…")).toBeVisible();
  });
});

test.describe("BulkAddItemsModal commit: mixed categories in one batch", () => {
  test("3 cards with 3 different categories commit with 3 different `category` payloads", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const wanted = ["Food", "Clothes", "Shoes"].map((n) => byName(categories, n));
    const payloads = captureCreatePayloads(page);

    const dialog = await openBulkFromAllItems(page);
    await turnAutoRecognizeOff(dialog);
    await pickAndWaitReady(dialog, ["photo-01.png", "photo-02.png", "photo-03.png"]);

    const names = ["Mixed Yogurt", "Mixed Cardigan", "Mixed Sneakers"];
    for (let i = 0; i < 3; i++) {
      await setCard(dialog, i, names[i], wanted[i].id);
    }
    await expect(dialog.getByText(/^3 of 3 ready$/)).toBeVisible();

    await commitButton(dialog).click();
    await expect(dialog).toHaveCount(0, { timeout: 15000 });

    expect(payloads.length).toBe(3);
    for (let i = 0; i < 3; i++) {
      const p = payloads.find((b) => b.name === names[i]);
      expect(p, `payload for ${names[i]}`).toBeTruthy();
      expect(p!.category).toBe(wanted[i].name);
    }
    expect(new Set(payloads.map((p) => p.category)).size).toBe(3);

    const items: Array<{ name: string; category: string }> = await (
      await page.request.get("/api/inventory/")
    ).json();
    for (let i = 0; i < 3; i++) {
      expect(items.find((it) => it.name === names[i])?.category).toBe(wanted[i].name);
    }
  });
});

test.describe("BulkAddItemsModal commit: partial failure, summary, and retry", () => {
  test("a stubbed 500 on one card leaves it in error while the others are created and dropped; retry then closes the modal", async ({
    page,
  }) => {
    await signup(page);
    const categories = await getCategories(page);
    const food = byName(categories, "Food");
    await stubUploadsSuccess(page);

    let mode: "fail-beta" | "all-succeed" = "fail-beta";
    let created = 0;
    await page.route("**/api/inventory/", async (route: Route) => {
      const req = route.request();
      if (req.method() !== "POST") {
        await route.fallback();
        return;
      }
      const body = JSON.parse(req.postData() ?? "{}");
      if (mode === "fail-beta" && body.name === "Beta") {
        await new Promise((r) => setTimeout(r, 300));
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Couldn't add this item — try again." }),
        });
        return;
      }
      created += 1;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: `fake-${created}`,
          name: body.name,
          subtitle: "",
          category: body.category,
          subcategory: "",
          categoryId: String(food.id),
          subCategoryId: null,
          location: "",
          quantity: 1,
          tags: [],
          notes: "",
          imageURL: body.imageURL,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      });
    });

    const dialog = await openBulkFromAllItems(page);
    await turnAutoRecognizeOff(dialog);
    await pickAndWaitReady(dialog, ["photo-01.png", "photo-02.png", "photo-03.png"]);
    await setCard(dialog, 0, "Alpha", food.id);
    await setCard(dialog, 1, "Beta", food.id);
    await setCard(dialog, 2, "Gamma", food.id);

    // The red "X added, Y failed" line is shown only when failures exist.
    await expect(dialog.getByText(/added, \d+ failed/)).toHaveCount(0);
    await expect(dialog.getByText(/^3 of 3 ready$/)).toBeVisible();

    await commitButton(dialog).click();

    // Mid-commit: capture a screenshot showing a mix of creating/done/error.
    await page.waitForTimeout(150);
    await page.screenshot({ path: "test-results/screenshots/t7-mid-commit-1280.png" });

    // Settle: red summary line reads "2 added, 1 failed".
    const summary = dialog.getByText("2 added, 1 failed");
    await expect(summary).toBeVisible({ timeout: 15000 });
    await expect(summary).toHaveClass(/text-cute-danger/);
    await expect(dialog).toBeVisible(); // stays open on partial failure

    // Footer status line: Beta (failed, still has name + category) is
    // resumable, so it counts as ready.
    await expect(dialog.getByText(/^1 of 1 ready$/)).toBeVisible();

    // Only Beta's row remains, in error, with a per-card Retry in the new row.
    await expect(dialog.getByLabel("Item name")).toHaveCount(1);
    await expect(dialog.getByLabel("Item name")).toHaveValue("Beta");
    const betaRow = dialog.getByTestId("bulk-card");
    await expect(betaRow).toHaveCount(1);
    await expect(betaRow.getByText("Couldn't add this item — try again.")).toBeVisible();
    const retryButton = betaRow.getByRole("button", { name: "Retry" });
    await expect(retryButton).toBeEnabled();
    await expect(betaRow.getByRole("button", { name: "Remove", exact: true })).toBeVisible();

    // Partial-failure end-state screenshots at both required widths.
    await page.screenshot({ path: "test-results/screenshots/t7-partial-failure-1280.png" });
    await page.setViewportSize({ width: 375, height: 800 });
    await page.screenshot({ path: "test-results/screenshots/t7-partial-failure-375.png" });
    await page.setViewportSize({ width: 1280, height: 800 });

    // Now retry against a healthy stub.
    mode = "all-succeed";
    await retryButton.click();

    // Nothing left in the grid -> modal closes.
    await expect(dialog).toHaveCount(0, { timeout: 15000 });
    expect(created).toBe(3); // Alpha, Gamma, then Beta's retry
  });
});

test.describe("BulkAddItemsModal commit: double-press is non-reentrant", () => {
  test("pressing commit twice in rapid succession creates each item exactly once", async ({ page }) => {
    await signup(page);
    const categories = await getCategories(page);
    const food = byName(categories, "Food");
    await stubUploadsSuccess(page);
    let n = 0;
    await page.route("**/api/inventory/", async (route: Route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      n += 1;
      // Small delay keeps the request "in flight" across the double click.
      await new Promise((r) => setTimeout(r, 150));
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: `fake-${n}`,
          name: "x",
          subtitle: "",
          category: food.name,
          subcategory: "",
          categoryId: String(food.id),
          subCategoryId: null,
          location: "",
          quantity: 1,
          tags: [],
          notes: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      });
    });

    const dialog = await openBulkFromAllItems(page);
    await turnAutoRecognizeOff(dialog);
    await pickAndWaitReady(dialog, ["photo-01.png", "photo-02.png"]);
    await setCard(dialog, 0, "One", food.id);
    await setCard(dialog, 1, "Two", food.id);

    // Dispatch two real click events back-to-back in a single JS turn, so
    // both invoke the onClick handler before React can re-render the button
    // as disabled — this is what actually exercises the non-reentrancy
    // guard (`commitInFlightRef`) rather than Playwright's own
    // actionability wait, which would simply block on the second click once
    // the button visibly disables.
    await commitButton(dialog).evaluate((el: HTMLElement) => {
      (el as HTMLButtonElement).click();
      (el as HTMLButtonElement).click();
    });

    await expect(dialog).toHaveCount(0, { timeout: 15000 });
    expect(n).toBe(2); // not 4
  });
});

test.describe("BulkAddItemsModal commit: onSaved fires exactly once per pass", () => {
  test("committing 3 cards in one pass triggers exactly one GET /api/inventory/ refetch", async ({ page }) => {
    await signup(page);
    const categories = await getCategories(page);
    const food = byName(categories, "Food");
    await stubUploadsSuccess(page);
    let n = 0;
    await page.route("**/api/inventory/", async (route: Route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      n += 1;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: `fake-${n}`,
          name: "x",
          subtitle: "",
          category: food.name,
          subcategory: "",
          categoryId: String(food.id),
          subCategoryId: null,
          location: "",
          quantity: 1,
          tags: [],
          notes: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      });
    });

    const dialog = await openBulkFromAllItems(page);
    await turnAutoRecognizeOff(dialog);
    await pickAndWaitReady(dialog, ["photo-01.png", "photo-02.png", "photo-03.png"]);
    await setCard(dialog, 0, "One", food.id);
    await setCard(dialog, 1, "Two", food.id);
    await setCard(dialog, 2, "Three", food.id);

    // Baseline after the page's own mount-time fetch (and this modal opening
    // triggers no GET of its own).
    const getCount = countListInventoryGets(page);
    const baseline = getCount();

    await commitButton(dialog).click();
    await expect(dialog).toHaveCount(0, { timeout: 15000 });

    // The modal's onClose() fires synchronously right after the
    // fire-and-forget onSaved()/refresh() call, so the dialog can disappear
    // from the DOM a tick before Playwright's own CDP request-event
    // delivery catches up to the in-flight fetch — poll rather than
    // assert synchronously, to avoid an instrumentation-timing race
    // unrelated to the app's actual (single-fire) behaviour.
    await expect.poll(() => getCount() - baseline, { timeout: 5000 }).toBe(1);
    expect(n).toBe(3);
  });
});
