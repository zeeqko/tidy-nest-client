// End-to-end tests for the builder's Save flow: the top-bar Save pill opens
// the "Save look" sheet (auto name with a "✨ auto" hint, occasion chips with
// "＋ New", inline errors; a bottom sheet on phones), create lands on the new look's detail page, and
// edit mode offers "Save changes" (same look) and "Save as a new look" (a
// copy; the original is untouched). Runs in the desktop (1440x900, mouse)
// and mobile (390x844, touch) projects.
import type { Page } from "@playwright/test";
import { test, expect, ITEM_NAMES, type ApiLookItem } from "./fixtures";
import {
  addPiece,
  canvasNodes,
  lookIdFromUrl,
  occasionChip,
  openBuilder,
  openSaveSheet,
  saveNewLook,
  saveScreenshot,
  saveSheet,
  saveTrigger,
  sheetNameInput,
} from "./support/canvas";

const { linen, denim, sneakers } = ITEM_NAMES;

const autoHint = (page: Page) => saveSheet(page).getByText("✨ auto", { exact: true });
const primaryCreate = (page: Page) => saveSheet(page).getByRole("button", { name: "Save look", exact: true });
const newOccasionChip = (page: Page) => saveSheet(page).getByRole("button", { name: "New occasion" });
const newOccasionInput = (page: Page) => saveSheet(page).getByRole("textbox", { name: "New occasion" });

const transformOf = ({ itemId, x, y, width, height, rotation, zIndex }: ApiLookItem) => ({
  itemId,
  x,
  y,
  width,
  height,
  rotation,
  zIndex,
});
const byZ = (items: ApiLookItem[]) => [...items].sort((a, b) => a.zIndex - b.zIndex).map(transformOf);

/** Adds the "＋ New" occasion `value` (typed as given) with Enter. */
async function addCustomOccasion(page: Page, value: string) {
  await newOccasionChip(page).click();
  await expect(newOccasionInput(page)).toBeFocused();
  await newOccasionInput(page).fill(value);
  await newOccasionInput(page).press("Enter");
  await expect(newOccasionInput(page)).toHaveCount(0);
}

test.describe("save sheet", () => {
  test("(a) Save opens the sheet with the auto name and '✨ auto'; an occasion changes it live until the user types", async ({
    authedPage: page,
  }) => {
    await openBuilder(page);
    await addPiece(page, linen, 1);
    await addPiece(page, denim, 2);

    const sheet = await openSaveSheet(page);
    await expect(sheet.getByRole("heading", { name: "Save look" })).toBeVisible();
    // Focus moved into the sheet; the page behind can't scroll.
    expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await expect(sheet.getByText("Name is optional — we suggest one from your pieces")).toBeVisible();
    await expect(sheetNameInput(page)).toHaveValue(`${linen} look`);
    await expect(sheetNameInput(page)).toHaveAttribute("maxlength", "60");
    await expect(autoHint(page)).toBeVisible();
    for (const chip of ["Casual", "Work", "Date Night", "Formal"]) {
      await expect(occasionChip(page, chip)).toHaveAttribute("aria-pressed", "false");
    }
    await expect(newOccasionChip(page)).toHaveText("＋ New");

    // Picking an occasion renames it live; tapping the chip again clears it.
    await occasionChip(page, "Work").click();
    await expect(occasionChip(page, "Work")).toHaveAttribute("aria-pressed", "true");
    await expect(sheetNameInput(page)).toHaveValue("Work look");
    await expect(autoHint(page)).toBeVisible();
    await occasionChip(page, "Date Night").click();
    await expect(occasionChip(page, "Work")).toHaveAttribute("aria-pressed", "false");
    await expect(sheetNameInput(page)).toHaveValue("Date Night look");
    await occasionChip(page, "Date Night").click();
    await expect(occasionChip(page, "Date Night")).toHaveAttribute("aria-pressed", "false");
    await expect(sheetNameInput(page)).toHaveValue(`${linen} look`);

    // Once the user types, the name is theirs: no hint, and occasions no
    // longer rename it.
    await sheetNameInput(page).fill("Sunday stroll");
    await expect(autoHint(page)).toHaveCount(0);
    await occasionChip(page, "Casual").click();
    await expect(sheetNameInput(page)).toHaveValue("Sunday stroll");

    // Closing and reopening keeps what was entered.
    await page.keyboard.press("Escape");
    await expect(saveSheet(page)).toHaveCount(0);
    await openSaveSheet(page);
    await expect(sheetNameInput(page)).toHaveValue("Sunday stroll");
    await expect(occasionChip(page, "Casual")).toHaveAttribute("aria-pressed", "true");
  });

  test("(b) a cleared name saves with the auto name", async ({ authedPage: page, userApi }) => {
    await openBuilder(page);
    await addPiece(page, linen, 1);
    await openSaveSheet(page);
    await sheetNameInput(page).fill("");
    await expect(sheetNameInput(page)).toHaveValue("");
    await expect(sheetNameInput(page)).toHaveAttribute("placeholder", `${linen} look`);
    await occasionChip(page, "Formal").click();
    await expect(sheetNameInput(page)).toHaveAttribute("placeholder", "Formal look");
    await primaryCreate(page).click();
    await expect(page).toHaveURL(/\/stylebook\/(?!create$)[^/]+$/);
    const look = await userApi.look(lookIdFromUrl(page));
    expect(look.name).toBe("Formal look");
    expect(look.occasion).toBe("Formal");

    // Whitespace-only also falls back (to the piece-based name here).
    await openBuilder(page);
    await addPiece(page, denim, 1);
    await openSaveSheet(page);
    await sheetNameInput(page).fill("   ");
    await primaryCreate(page).click();
    await expect(page).toHaveURL(/\/stylebook\/(?!create$)[^/]+$/);
    const second = await userApi.look(lookIdFromUrl(page));
    expect(second.name).toBe(`${denim} look`);
    expect(second.occasion).toBe("");
  });

  test("(c) a custom name and a '＋ New' occasion are saved; new occasions are trimmed, deduped and selected", async ({
    authedPage: page,
    userApi,
  }) => {
    await openBuilder(page);
    await addPiece(page, linen, 1);
    await openSaveSheet(page);
    await sheetNameInput(page).fill("Weekend brunch fit");

    // A case-insensitive duplicate selects the existing chip instead.
    await addCustomOccasion(page, "  work ");
    await expect(occasionChip(page, "Work")).toHaveAttribute("aria-pressed", "true");
    await expect(saveSheet(page).getByRole("button", { name: /^work$/ })).toHaveCount(0);
    // Empty input adds nothing.
    await addCustomOccasion(page, "   ");
    await expect(saveSheet(page).locator("button[aria-pressed]")).toHaveCount(4);
    await expect(occasionChip(page, "Work")).toHaveAttribute("aria-pressed", "true");
    // A new one is trimmed (and capped at 30 characters), added and selected.
    await newOccasionChip(page).click();
    await expect(newOccasionInput(page)).toHaveAttribute("maxlength", "30");
    await newOccasionInput(page).fill("  Brunch   with  friends ");
    await saveSheet(page).getByRole("button", { name: "Add", exact: true }).click();
    const brunch = occasionChip(page, "Brunch with friends");
    await expect(brunch).toHaveAttribute("aria-pressed", "true");
    await expect(occasionChip(page, "Work")).toHaveAttribute("aria-pressed", "false");
    // Escape in the "＋ New" input closes only that input.
    await newOccasionChip(page).click();
    await newOccasionInput(page).press("Escape");
    await expect(newOccasionInput(page)).toHaveCount(0);
    await expect(saveSheet(page)).toBeVisible();

    await primaryCreate(page).click();
    await expect(page).toHaveURL(/\/stylebook\/(?!create$)[^/]+$/);
    const look = await userApi.look(lookIdFromUrl(page));
    expect(look.name).toBe("Weekend brunch fit");
    expect(look.occasion).toBe("Brunch with friends");
  });

  test("(d) after create the URL is the new look's detail page and the look has the expected items", async ({
    authedPage: page,
    userApi,
    closet,
  }) => {
    await openBuilder(page);
    await addPiece(page, linen, 1);
    await addPiece(page, denim, 2);
    const nodes = await canvasNodes(page);
    const id = await saveNewLook(page, "Detail landing");
    await expect(page).toHaveURL(new RegExp(`/stylebook/${id}$`));
    await expect(page.getByRole("heading", { name: "Detail landing" }).filter({ visible: true })).toBeVisible();

    const looks = await userApi.looks();
    expect(looks.map((l) => l.id)).toEqual([id]);
    const look = await userApi.look(id);
    expect(look.items.map((i) => i.itemId).sort()).toEqual([closet.items[linen].id, closet.items[denim].id].sort());
    const saved = [...look.items].sort((a, b) => a.zIndex - b.zIndex);
    saved.forEach((item, i) => {
      for (const key of ["x", "y", "width", "height", "rotation"] as const) {
        expect(item[key], `item ${i} ${key}`).toBeCloseTo(nodes[i][key], 6);
      }
    });

    // The create replaced the builder's history entry: Back skips the
    // (now empty) builder and returns to where the user came from.
    await page.goBack();
    await expect(page).not.toHaveURL(/\/stylebook\/create$/);
    await expect(page).toHaveURL(/\/$/);
  });

  test("(e) edit: 'Save changes' updates the same look; 'Save as a new look' creates a copy and leaves the original", async ({
    authedPage: page,
    userApi,
    closet,
  }) => {
    // Created through the API, with a custom occasion and exact geometry.
    const items = [
      { itemId: closet.items[linen].id, x: 40.5, y: 60.25, width: 180, height: 220.125, rotation: -7.5, zIndex: 1001 },
      { itemId: closet.items[sneakers].id, x: 150, y: 560, width: 110, height: 90, rotation: 0, zIndex: 3 },
    ];
    const res = await page.request.post("/api/looks/", { data: { name: "Picnic day", occasion: "Picnic", items } });
    expect(res.status()).toBe(201);
    const original = (await res.json()) as { id: string };
    const before = await userApi.look(original.id);

    await openBuilder(page, `/stylebook/${original.id}/edit`);
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(2);
    const sheet = await openSaveSheet(page);
    await expect(sheet.getByRole("heading", { name: "Save changes" })).toBeVisible();
    // Prefilled from the look; the name is the user's, so no auto hint. The
    // look's own (non-seed) occasion is a chip, selected.
    await expect(sheetNameInput(page)).toHaveValue("Picnic day");
    await expect(autoHint(page)).toHaveCount(0);
    await expect(occasionChip(page, "Picnic")).toHaveAttribute("aria-pressed", "true");
    await expect(sheet.getByRole("button", { name: "Save look", exact: true })).toHaveCount(0);

    await sheetNameInput(page).fill("Picnic day, renamed");
    await sheet.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/stylebook/${original.id}$`));
    let looks = await userApi.looks();
    expect(looks).toHaveLength(1);
    const updated = await userApi.look(original.id);
    expect(updated.id).toBe(original.id);
    expect(updated.name).toBe("Picnic day, renamed");
    expect(updated.occasion).toBe("Picnic");
    expect(byZ(updated.items)).toEqual(byZ(before.items));

    // Save as a new look: a second look; the original is unchanged.
    await openBuilder(page, `/stylebook/${original.id}/edit`);
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(2);
    await openSaveSheet(page);
    await sheetNameInput(page).fill("Picnic copy");
    await occasionChip(page, "Casual").click();
    await saveSheet(page).getByRole("button", { name: "Save as a new look", exact: true }).click();
    await expect(page).toHaveURL(/\/stylebook\/(?!create$)[^/]+$/);
    const copyId = lookIdFromUrl(page);
    expect(copyId).not.toBe(original.id);
    // Back from the copy skips the editor entry it replaced.
    await page.goBack();
    await expect(page).not.toHaveURL(/\/edit$/);
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`/stylebook/${copyId}$`));

    looks = await userApi.looks();
    expect(looks.map((l) => l.id).sort()).toEqual([original.id, copyId].sort());
    const stillOriginal = await userApi.look(original.id);
    expect(stillOriginal.name).toBe("Picnic day, renamed");
    expect(stillOriginal.occasion).toBe("Picnic");
    expect(byZ(stillOriginal.items)).toEqual(byZ(before.items));
    const copy = await userApi.look(copyId);
    expect(copy.name).toBe("Picnic copy");
    expect(copy.occasion).toBe("Casual");
    expect(byZ(copy.items)).toEqual(byZ(before.items));
  });

  test("(f) Save is disabled with no pieces, and tapping it says why", async ({ authedPage: page }, testInfo) => {
    await openBuilder(page);
    const save = saveTrigger(page);
    await expect(save).toBeVisible();
    await expect(save).toBeDisabled();
    await expect(save).toHaveAttribute("title", "Add at least one piece");
    const hint = page.getByRole("status").filter({ hasText: "Add at least one piece" });
    await expect(hint).toHaveCount(0);
    await save.click({ force: true });
    // A visible, announced cue (a tooltip never shows on touch)...
    await expect(hint).toBeVisible();
    await expect(hint).toBeInViewport();
    await saveScreenshot(page, testInfo, "save-disabled-hint");
    await expect(saveSheet(page)).toHaveCount(0);
    // ...that hides itself after ~3 s.
    await expect(hint).toHaveCount(0, { timeout: 6000 });

    // Placing a piece hides it straight away.
    await save.click({ force: true });
    await expect(hint).toBeVisible();
    await addPiece(page, linen, 1);
    await expect(hint).toHaveCount(0, { timeout: 1000 });
    await expect(save).toBeEnabled();
    expect(await save.getAttribute("title")).toBeNull();
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await canvasNodes(page)).length).toBe(0);
    await expect(save).toBeDisabled();
  });

  test("(g) a failed save shows an inline error, keeps the sheet and the typed name, and a retry succeeds", async ({
    authedPage: page,
    userApi,
  }) => {
    await openBuilder(page);
    await addPiece(page, linen, 1);
    let failures = 0;
    await page.route(
      (url) => url.pathname === "/api/looks/",
      async (route) => {
        // Only the first create fails; everything else goes to the server.
        if (route.request().method() !== "POST" || failures > 0) return route.fallback();
        failures += 1;
        // Slow enough to see the saving state.
        await new Promise((resolve) => setTimeout(resolve, 400));
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Server is having a moment" }) });
      },
    );

    await openSaveSheet(page);
    await sheetNameInput(page).fill("Retry look");
    await primaryCreate(page).click();
    const saving = saveSheet(page).getByRole("button", { name: "Saving…" });
    await expect(saving).toBeVisible();
    await expect(saving).toBeDisabled();
    const alert = saveSheet(page).getByRole("alert");
    await expect(alert).toHaveText("Server is having a moment");
    expect(failures).toBe(1);
    await expect(saveSheet(page)).toBeVisible();
    await expect(page).toHaveURL(/\/stylebook\/create$/);
    await expect(sheetNameInput(page)).toHaveValue("Retry look");
    await expect(primaryCreate(page)).toBeEnabled();
    expect(await userApi.looks()).toHaveLength(0);

    await primaryCreate(page).click();
    await expect(page).toHaveURL(/\/stylebook\/(?!create$)[^/]+$/);
    const look = await userApi.look(lookIdFromUrl(page));
    expect(look.name).toBe("Retry look");
    expect(await userApi.looks()).toHaveLength(1);
  });

  test("(h) Esc, the close control and (desktop) the backdrop close the sheet; focus returns to Save", async ({
    authedPage: page,
  }, testInfo) => {
    const phone = testInfo.project.name === "mobile";
    await openBuilder(page);
    await addPiece(page, linen, 1);

    await openSaveSheet(page);
    await page.keyboard.press("Escape");
    await expect(saveSheet(page)).toHaveCount(0);
    await expect(saveTrigger(page)).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");

    // The sheet's own close control (✕ at every size).
    await openSaveSheet(page);
    await expect(saveSheet(page).getByRole("button", { name: "Go back" })).toHaveCount(0);
    await saveSheet(page).getByRole("button", { name: "Close" }).click();
    await expect(saveSheet(page)).toHaveCount(0);
    await expect(saveTrigger(page)).toBeFocused();
    // The builder is still there with its piece.
    expect(await canvasNodes(page)).toHaveLength(1);

    // A tap/click on the dimmed backdrop above the sheet closes it too.
    await openSaveSheet(page);
    if (phone) await page.touchscreen.tap(195, 30);
    else await page.mouse.click(10, 10);
    await expect(saveSheet(page)).toHaveCount(0);
    await expect(saveTrigger(page)).toBeFocused();
  });
});
