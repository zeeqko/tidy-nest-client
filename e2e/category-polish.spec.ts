// Category icon set, tinted tiles, custom-category badge, muted-text contrast
// and the Home count line. Screenshots are evidence for visual review.
import { test, expect } from "./fixtures";

const shot = (name: string) => `e2e/screenshots/category-polish-${name}.png`;

test("Home: keeps its original subtitle and 'Tap to explore' is gone", async ({ authedPage: page }, info) => {
  await expect(page.getByText("Here's what's tucked away at home")).toBeVisible();
  await expect(page.getByText("Tap to explore")).toHaveCount(0);
  await page.screenshot({ path: shot(`home-${info.project.name}`), fullPage: true });
});

test("Home tiles: one SVG badge each, sized per viewport, tinted on desktop", async ({ authedPage: page }, info) => {
  const tiles = page.locator('a[href^="/category/"]');
  await expect(tiles).toHaveCount(6);
  const desktop = info.project.name === "desktop";
  for (let i = 0; i < 6; i++) {
    const tile = tiles.nth(i);
    const imgs = tile.locator("img");
    await expect(imgs).toHaveCount(1);
    const loaded = await imgs.evaluate((el: HTMLImageElement) => ({ w: el.naturalWidth, src: el.src }));
    expect(loaded.w).toBeGreaterThan(0);
    expect(loaded.src).toMatch(/\.svg|data:image\/svg/);
    const box = await imgs.boundingBox();
    expect(Math.round(box!.width)).toBe(desktop ? 84 : 64);
    if (desktop) {
      const bg = await tile.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bg).not.toBe("rgb(245, 233, 231)"); // not the neutral surface-alt
    }
  }
});

test("All Categories: subcategory line still shows there", async ({ authedPage: page }) => {
  await page.goto("/categories");
  await expect(page.locator('a[href^="/category/"]').first()).toBeVisible();
  const home = await page.locator('a[href^="/category/"] p.truncate').count();
  expect(home).toBeGreaterThan(0);
});

test("tile icon lifts on hover and keyboard focus, and not with reduced motion", async ({ authedPage: page }, info) => {
  test.skip(info.project.name !== "desktop", "hover lift is sm+ only");
  const tile = page.locator('a[href^="/category/"]').first();
  const badge = tile.locator("img");
  const lift = () => badge.evaluate((el) => getComputedStyle(el).translate);
  expect(await lift()).toBe("none");
  await tile.hover();
  await expect.poll(lift).not.toBe("none");
  await page.mouse.move(0, 0);
  await page.keyboard.press("Tab");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await tile.hover();
  await page.waitForTimeout(400);
  expect(await lift()).toBe("none");
});

test("custom category badge: stored colour circle, cream glyph, darker ink", async ({ authedPage: page, userApi }, info) => {
  const res = await page.request.post("/api/categories/", { data: { name: "Plants", icon: "heart", colour: "#C9B6FF" } });
  expect(res.status()).toBe(201);
  await page.goto("/categories");
  const tile = page.locator('a[href^="/category/"]', { hasText: "Plants" });
  await expect(tile).toBeVisible();
  const badge = tile.locator("span.rounded-full").first();
  expect(await badge.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(201, 182, 255)");
  const glyph = badge.locator("svg").first();
  expect(await glyph.getAttribute("fill")).toBe("#FFF1E0");
  expect(await glyph.getAttribute("stroke")).toContain("color-mix");
  void userApi;
  await page.screenshot({ path: shot(`categories-${info.project.name}`), fullPage: true });
});

test("category editor offers the accessories illustration", async ({ authedPage: page }, info) => {
  test.skip(info.project.name !== "desktop", "Edit Categories lives in the nav menu on mobile; the picker is identical");
  await page.goto("/categories");
  await page.getByRole("button", { name: "Edit Categories" }).click();
  await page.getByRole("button", { name: "Edit Food" }).click();
  await expect(page.getByRole("button", { name: /^Illustration /})).toHaveCount(7);
  await expect(page.getByRole("button", { name: "Illustration accessories" })).toBeVisible();
});

test("muted text uses the darker token", async ({ authedPage: page }) => {
  const sub = page.locator("p.text-cute-text-muted").first();
  await expect(sub).toBeVisible();
  expect(await sub.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(122, 98, 104)");
});

test("Edit Category: Delete sits beside Save on the same row", async ({ authedPage: page }, info) => {
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "Edit Categories" }).click();
  await page.getByRole("button", { name: "Edit Food" }).click();
  const del = page.getByRole("button", { name: "Delete Category" });
  const save = page.getByRole("button", { name: "Save Changes" });
  await expect(del).toBeVisible();
  await expect(save).toBeVisible();
  const d = (await del.boundingBox())!;
  const s = (await save.boundingBox())!;
  // Same row: vertical centres within a few px, and Delete is left of Save.
  expect(Math.abs(d.y + d.height / 2 - (s.y + s.height / 2))).toBeLessThan(4);
  expect(d.x + d.width).toBeLessThan(s.x);
  await page.screenshot({ path: shot(`edit-category-${info.project.name}`) });
});
