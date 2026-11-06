// End-to-end tests for the Style Book list page (/stylebook): image-only
// tiles linking to each look, the phone layout (one-line pill row, floating
// "New look" above the bottom nav, no captions) and the web layout (heading
// row with "New look", plain-text underlined filters, captions on hover and
// keyboard focus without layout shift), the empty / empty-filtered / error
// states, and thumbnails that never clip out-of-base or rotated pieces.
// Runs in the desktop (1440x900, mouse) and mobile (390x844, touch)
// projects; viewport-specific tests skip themselves.
import type { Locator, Page } from "@playwright/test";
import { test, expect, ITEM_NAMES, type Api, type ApiLook, type Closet } from "./fixtures";
import { saveScreenshot } from "./support/canvas";

const { linen, denim, tee, sneakers, tote } = ITEM_NAMES;

/** Mirrors lookTileLabel in src/lib/styleBookList.ts. */
const tileName = (look: Pick<ApiLook, "name" | "occasion">) => (look.occasion ? `${look.name}, ${look.occasion}` : look.name);

/** Six looks over four seed occasions, two extra occasions and one without. */
async function seedLooks(userApi: Api, closet: Closet): Promise<ApiLook[]> {
  const id = (name: string) => closet.items[name].id;
  const piece = (name: string, x: number, y: number, rotation = 0, zIndex = 0) => ({
    itemId: id(name),
    x,
    y,
    width: 120,
    height: 170,
    rotation,
    zIndex,
  });
  const specs = [
    { name: "Linen summer", occasion: "Casual", items: [piece(linen, 60, 60), piece(sneakers, 200, 420, 0, 1)] },
    { name: "Office day", occasion: "Work", items: [piece(denim, 80, 80, -6), piece(tee, 180, 260, 0, 1)] },
    { name: "Dinner out", occasion: "Date Night", items: [piece(linen, 100, 120)] },
    { name: "Brunch look", occasion: "Brunch", items: [piece(tote, 140, 200, 12)] },
    { name: "Long weekend", occasion: "Weekend away", items: [piece(denim, 40, 40), piece(tote, 220, 300, 0, 1)] },
    { name: "Just a tee", occasion: "", items: [piece(tee, 120, 160)] },
  ];
  const looks: ApiLook[] = [];
  for (const spec of specs) looks.push(await userApi.createLook(spec));
  return looks;
}

const lookList = (page: Page) => page.getByRole("list", { name: "Looks" });
const tiles = (page: Page) => lookList(page).getByRole("link");
const visibleText = (page: Page, text: string) => page.getByText(text, { exact: true }).filter({ visible: true });
const bottomNav = (page: Page) => page.locator("nav", { has: page.getByRole("button", { name: "Add item" }) });

async function waitForThumbnails(scope: Locator) {
  await expect
    .poll(() => scope.locator("img").evaluateAll((imgs) => imgs.length > 0 && imgs.every((i) => (i as HTMLImageElement).complete)))
    .toBe(true);
}

async function openList(page: Page, looks: ApiLook[]) {
  await page.goto("/stylebook");
  await expect(tiles(page)).toHaveCount(looks.length);
  await waitForThumbnails(lookList(page));
}

/** "All", the seed occasions, then the looks' extra occasions (in the API's list order). */
async function expectOccasionOrder(buttons: Locator) {
  await expect(buttons).toHaveCount(7);
  const labels = await buttons.allTextContents();
  expect(labels.slice(0, 5)).toEqual(["All", "Casual", "Work", "Date Night", "Formal"]);
  expect(labels.slice(5).sort()).toEqual(["Brunch", "Weekend away"]);
}

const opacity = (el: Locator) => el.evaluate((node) => getComputedStyle(node).opacity);

test.describe("Style Book list", () => {
  test("(a) one image tile per look, each a link to its detail page", async ({ authedPage: page, userApi, closet }) => {
    const looks = await seedLooks(userApi, closet);
    await openList(page, looks);
    await expect(visibleText(page, `${looks.length} looks`)).toBeVisible();
    for (const look of looks) {
      const tile = lookList(page).locator(`a[href="/stylebook/${look.id}"]`);
      await expect(tile).toHaveCount(1);
      await expect(tile).toHaveAccessibleName(tileName(look));
    }
    // A look without an occasion is named by its name alone.
    await expect(lookList(page).getByRole("link", { name: "Just a tee", exact: true })).toHaveCount(1);

    const target = looks[1];
    await lookList(page).getByRole("link", { name: tileName(target) }).click();
    await expect(page).toHaveURL(new RegExp(`/stylebook/${target.id}$`));
    await expect(page.getByRole("heading", { name: target.name }).filter({ visible: true })).toBeVisible();
  });

  test("(b) phone: tiles show only the collage, no name, occasion, piece count or edit/delete controls", async ({
    authedPage: page,
    userApi,
    closet,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "phone layout");
    const looks = await seedLooks(userApi, closet);
    await openList(page, looks);
    for (const look of looks) {
      await expect(lookList(page).getByText(look.name, { exact: true })).toBeHidden();
      if (look.occasion) await expect(lookList(page).getByText(look.occasion, { exact: true })).toBeHidden();
    }
    await expect(lookList(page).getByText(/\d+ pieces?/).filter({ visible: true })).toHaveCount(0);
    await expect(lookList(page).getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^(Edit|Delete)\b/ })).toHaveCount(0);
    // Two columns of equal square tiles.
    const boxes = await lookList(page).getByTestId("look-tile").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
    expect(boxes[0].top).toBeCloseTo(boxes[1].top, 0);
    expect(boxes[2].top).toBeGreaterThan(boxes[0].bottom);
    for (const b of boxes) expect(b.width).toBeCloseTo(b.height, 0);
    // Back button kept; the old top-bar "+" is gone.
    await expect(page.getByRole("button", { name: "Go back" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Look" })).toHaveCount(0);
    await saveScreenshot(page, testInfo, "list-phone");
  });

  test("(c) web: the caption is hidden at rest and fades in on hover and keyboard focus, without moving the tile", async ({
    authedPage: page,
    userApi,
    closet,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "hover captions are web-only");
    const looks = await seedLooks(userApi, closet);
    await openList(page, looks);
    await page.mouse.move(2, 2);
    await expect(page.getByRole("button", { name: /^(Edit|Delete)\b/ })).toHaveCount(0);

    const look = looks[0];
    const tile = lookList(page).getByRole("link", { name: tileName(look) });
    const caption = tile.getByTestId("look-caption");
    // The caption row is laid out (height reserved) but transparent.
    await expect(caption).toHaveCSS("opacity", "0");
    await expect(caption).toContainText(look.name);
    await expect(caption).toContainText(look.occasion);
    const captionBox = (await caption.boundingBox())!;
    expect(captionBox.height).toBeGreaterThan(10);
    const restBox = (await tile.boundingBox())!;
    const restGrid = (await lookList(page).boundingBox())!;
    await saveScreenshot(page, testInfo, "list-web-rest");

    await tile.getByTestId("look-tile").hover();
    await expect.poll(() => opacity(caption)).toBe("1");
    const hoverBox = (await tile.boundingBox())!;
    const hoverGrid = (await lookList(page).boundingBox())!;
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(Math.abs(hoverBox[key] - restBox[key]), `tile ${key} unchanged on hover`).toBeLessThan(0.5);
      expect(Math.abs(hoverGrid[key] - restGrid[key]), `grid ${key} unchanged on hover`).toBeLessThan(0.5);
    }
    // Other captions stay hidden.
    await expect(lookList(page).getByRole("link", { name: tileName(looks[1]) }).getByTestId("look-caption")).toHaveCSS("opacity", "0");
    await saveScreenshot(page, testInfo, "list-web-hover");

    await page.mouse.move(2, 2);
    await expect.poll(() => opacity(caption)).toBe("0");

    // Keyboard: Tab from the last filter lands on the first tile.
    const filters = page.getByTestId("occasion-text-filters").getByRole("button");
    await filters.last().focus();
    await page.keyboard.press("Tab");
    const first = tiles(page).first();
    await expect(first).toBeFocused();
    const firstCaption = first.getByTestId("look-caption");
    await expect.poll(() => opacity(firstCaption)).toBe("1");
    const ring = first.getByTestId("look-tile");
    await expect(ring).toHaveCSS("outline-style", "solid");
    await expect(ring).toHaveCSS("outline-width", "2px");
    await expect(ring).toHaveCSS("outline-color", "rgb(153, 96, 110)");
    await saveScreenshot(page, testInfo, "list-web-focus");
    // Enter opens the focused look.
    const href = await first.getAttribute("href");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });

  test("(d) web: text filters with an underline narrow the list and the count; Clear filter resets", async ({
    authedPage: page,
    userApi,
    closet,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "web filters");
    const looks = await seedLooks(userApi, closet);
    await openList(page, looks);
    const filters = page.getByTestId("occasion-text-filters");
    await expectOccasionOrder(filters.getByRole("button"));
    await expect(page.getByTestId("occasion-pills")).toBeHidden();

    const all = filters.getByRole("button", { name: "All", exact: true });
    const work = filters.getByRole("button", { name: "Work", exact: true });
    await expect(all).toHaveAttribute("aria-pressed", "true");
    await expect(work).toHaveAttribute("aria-pressed", "false");
    // Plain text: no pill background; the active one is underlined in primary.
    for (const button of [all, work]) await expect(button).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(all).toHaveCSS("border-bottom-width", "2px");
    await expect(all).toHaveCSS("border-bottom-color", "rgb(153, 96, 110)");
    await expect(work).toHaveCSS("border-bottom-color", "rgba(0, 0, 0, 0)");

    await work.click();
    await expect(work).toHaveAttribute("aria-pressed", "true");
    await expect(work).toHaveCSS("border-bottom-color", "rgb(153, 96, 110)");
    await expect(tiles(page)).toHaveCount(1);
    await expect(tiles(page)).toHaveAccessibleName("Office day, Work");
    await expect(visibleText(page, "1 look")).toBeVisible();

    await filters.getByRole("button", { name: "Formal", exact: true }).click();
    await expect(page.getByText("No looks for this occasion yet")).toBeVisible();
    await expect(tiles(page)).toHaveCount(0);
    await expect(visibleText(page, "0 looks")).toBeVisible();
    await page.getByRole("button", { name: "Clear filter" }).click();
    await expect(tiles(page)).toHaveCount(looks.length);
    await expect(all).toHaveAttribute("aria-pressed", "true");
    await expect(visibleText(page, `${looks.length} looks`)).toBeVisible();
  });

  test("(d) phone: a one-line, sideways-scrolling pill row narrows the list and the count; Clear filter resets", async ({
    authedPage: page,
    userApi,
    closet,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "phone filters");
    const looks = await seedLooks(userApi, closet);
    await openList(page, looks);
    const row = page.getByTestId("occasion-pills");
    await expect(page.getByTestId("occasion-text-filters")).toBeHidden();
    const pills = row.getByRole("button");
    await expectOccasionOrder(pills);

    // One line: every pill on the same row, the row no taller than one pill
    // plus its padding, and it overflows sideways (scrollable, not wrapped).
    const pillBoxes = await pills.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
    for (const b of pillBoxes) expect(b.top).toBeCloseTo(pillBoxes[0].top, 0);
    const metrics = await row.evaluate((el) => ({
      clientHeight: el.clientHeight,
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      overflowX: getComputedStyle(el).overflowX,
    }));
    expect(metrics.clientHeight).toBeLessThan(pillBoxes[0].height * 1.6);
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
    expect(metrics.overflowX).toBe("auto");

    // Picking the last (off-screen) pill leaves it fully in view.
    const last = row.getByRole("button", { name: "Weekend away" });
    await last.click();
    await expect(last).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => {
        const [r, p] = [(await row.boundingBox())!, (await last.boundingBox())!];
        return p.x >= r.x - 0.5 && p.x + p.width <= r.x + r.width + 0.5;
      })
      .toBe(true);
    expect(await row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    await expect(tiles(page)).toHaveCount(1);
    await expect(tiles(page)).toHaveAccessibleName("Long weekend, Weekend away");
    await expect(visibleText(page, "1 look")).toBeVisible();
    await saveScreenshot(page, testInfo, "list-phone-filtered");

    await row.getByRole("button", { name: "Formal" }).click();
    await expect(page.getByText("No looks for this occasion yet")).toBeVisible();
    await expect(visibleText(page, "0 looks")).toBeVisible();
    await page.getByRole("button", { name: "Clear filter" }).click();
    await expect(tiles(page)).toHaveCount(looks.length);
    await expect(row.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    await expect(visibleText(page, `${looks.length} looks`)).toBeVisible();
  });

  test("(e) New look opens the builder: floating above the bottom nav on the phone, in the heading row on the web", async ({
    authedPage: page,
    userApi,
    closet,
  }, testInfo) => {
    const looks = await seedLooks(userApi, closet);
    await openList(page, looks);
    const newLook = page.getByRole("button", { name: "New look" });
    await expect(newLook).toHaveCount(1);
    const floating = page.getByTestId("floating-new-look");
    if (testInfo.project.name === "mobile") {
      await expect(floating).toBeVisible();
      await expect(newLook).toHaveAttribute("data-testid", "floating-new-look");
      const button = (await floating.boundingBox())!;
      const nav = (await bottomNav(page).boundingBox())!;
      const add = (await page.getByRole("button", { name: "Add item" }).boundingBox())!;
      expect(button.y + button.height, "clear of the bottom nav").toBeLessThanOrEqual(nav.y);
      expect(button.y + button.height, "clear of the raised Add item button").toBeLessThanOrEqual(add.y);
      expect(button.y + button.height, "within thumb reach").toBeGreaterThan(nav.y - 60);
      // Horizontally centred.
      expect(Math.abs(button.x + button.width / 2 - 195)).toBeLessThan(1);
      // Scrolled to the bottom, the last tile can still be seen above it.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const lastTile = (await tiles(page).last().boundingBox())!;
      expect(lastTile.y + lastTile.height).toBeLessThanOrEqual((await floating.boundingBox())!.y);
    } else {
      await expect(floating).toBeHidden();
      const heading = (await page.getByRole("heading", { name: "Style Book" }).boundingBox())!;
      const button = (await newLook.boundingBox())!;
      expect(button.x, "on the right of the heading row").toBeGreaterThan(heading.x + heading.width);
      const centre = button.y + button.height / 2;
      expect(centre, "level with the heading block").toBeGreaterThan(heading.y);
      expect(centre).toBeLessThan(heading.y + heading.height + 30);
    }
    await newLook.click();
    await expect(page).toHaveURL(/\/stylebook\/create$/);
  });

  test("(f) empty Style Book: Nothing here yet, with a New look button", async ({ authedPage: page }, testInfo) => {
    await page.goto("/stylebook");
    await expect(page.getByText("Nothing here yet")).toBeVisible();
    await expect(page.getByText("Build a look from your closet.")).toBeVisible();
    await expect(visibleText(page, "0 looks")).toBeVisible();
    await expect(lookList(page)).toHaveCount(0);
    // No filters with nothing to filter; no doubled floating button.
    await expect(page.getByTestId("occasion-pills")).toBeHidden();
    await expect(page.getByTestId("occasion-text-filters")).toBeHidden();
    await expect(page.getByTestId("floating-new-look")).toHaveCount(0);
    const newLook = page.getByRole("button", { name: "New look" });
    // The web heading row keeps its own button; the phone has only the empty state's.
    await expect(newLook).toHaveCount(testInfo.project.name === "desktop" ? 2 : 1);
    await saveScreenshot(page, testInfo, "list-empty");
    await newLook.last().click();
    await expect(page).toHaveURL(/\/stylebook\/create$/);
  });

  test("(f) a server error keeps the error message", async ({ authedPage: page }) => {
    await page.route(/\/api\/looks\/?$/, (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) }),
    );
    await page.goto("/stylebook");
    await expect(page.getByText(/^Couldn't load your Style Book from the server: /)).toBeVisible();
    await expect(page.getByText("Nothing here yet")).toHaveCount(0);
  });

  test("(g) a look with out-of-base and rotated edge pieces renders every piece inside its tile", async ({
    authedPage: page,
    userApi,
    closet,
  }, testInfo) => {
    const id = (name: string) => closet.items[name].id;
    const look = await userApi.createLook({
      name: "Edge Look",
      occasion: "Casual",
      items: [
        { itemId: id(linen), x: -230.5, y: 40.25, width: 120, height: 180, rotation: 0, zIndex: 0 },
        // Rotated, its unrotated rect touching the far right / bottom: only
        // the rotated-bounds crop keeps its corners inside.
        { itemId: id(denim), x: 470.75, y: 600, width: 130, height: 190, rotation: 35, zIndex: 1 },
        { itemId: id(sneakers), x: 150, y: 760.125, width: 90, height: 60, rotation: -20, zIndex: 2 },
      ],
    });
    await openList(page, [look]);
    const tile = lookList(page).getByRole("link", { name: "Edge Look, Casual" }).getByTestId("look-tile");
    const pieces = tile.getByTestId("look-thumbnail").locator(":scope > div.absolute");
    await expect(pieces).toHaveCount(3);
    const box = await tile.evaluate((el) => el.getBoundingClientRect().toJSON());
    const rects = await pieces.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
    for (const [i, r] of rects.entries()) {
      expect(r.left, `piece ${i} left`).toBeGreaterThanOrEqual(box.left - 0.5);
      expect(r.top, `piece ${i} top`).toBeGreaterThanOrEqual(box.top - 0.5);
      expect(r.right, `piece ${i} right`).toBeLessThanOrEqual(box.right + 0.5);
      expect(r.bottom, `piece ${i} bottom`).toBeLessThanOrEqual(box.bottom + 0.5);
    }
    await saveScreenshot(page, testInfo, "list-edge-tile", { target: tile });
  });
});
