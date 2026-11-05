// Shared Playwright fixtures for the Stylebook e2e tests.
//
// `authedPage` signs up a unique user through the API (the backend replies
// with an HttpOnly `tidy_session` cookie — the same session the SPA uses,
// since every API call it makes is a same-origin fetch through the Vite
// proxy), logs in again explicitly, checks the default categories' Stylebook
// groups, seeds a small closet (items with tags, an uploaded PNG photo, and
// one item without a photo), and hands back a page that carries that
// session. `page.request` shares the browser context's cookie jar, so the
// browser is signed in as the same user.
import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";
import { makePng } from "./support/png";

export interface ApiSubCategory {
  id: number;
  name: string;
}

export interface ApiCategory {
  id: number;
  name: string;
  icon: string | null;
  colour: string | null;
  stylebookGroup: string | null;
  subCategories: ApiSubCategory[];
}

export interface ApiItem {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  categoryId: string | null;
  imageURL?: string;
  cutoutURL?: string;
  tags: { name: string }[];
}

export interface ApiLookItem {
  itemId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  name?: string;
  imageURL?: string;
  cutoutURL?: string;
}

export interface ApiLook {
  id: string;
  name: string;
  occasion: string;
  items: ApiLookItem[];
}

let userCounter = 0;
export function uniqueEmail(prefix = "e2e"): string {
  userCounter += 1;
  return `${prefix}-${Date.now()}-${process.pid}-${userCounter}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

export const PASSWORD = "correct-horse-battery-staple";

/** Thin JSON helpers over an APIRequestContext that carries a session. */
export function api(request: APIRequestContext) {
  const json = async <T>(res: Awaited<ReturnType<APIRequestContext["get"]>>, expected: number): Promise<T> => {
    const body = await res.text();
    expect(res.status(), `${res.url()} -> ${body}`).toBe(expected);
    return (body ? JSON.parse(body) : undefined) as T;
  };
  return {
    async signupAndLogin(email: string, password = PASSWORD) {
      await json(await request.post("/api/auth/signup", { data: { name: "E2E Tester", email, password } }), 201);
      await json(await request.post("/api/auth/login", { data: { email, password } }), 200);
    },
    categories: async () => json<ApiCategory[]>(await request.get("/api/categories/"), 200),
    async category(name: string): Promise<ApiCategory> {
      const all = await this.categories();
      const found = all.find((c) => c.name === name);
      expect(found, `category ${name} exists`).toBeTruthy();
      return found!;
    },
    putCategory: async (id: number, data: Record<string, unknown>) =>
      json<ApiCategory>(await request.put(`/api/categories/${id}`, { data }), 200),
    upload: async (png: Buffer, filename = "photo.png") =>
      json<{ url: string }>(
        await request.post("/api/uploads", {
          multipart: { image: { name: filename, mimeType: "image/png", buffer: png } },
        }),
        201,
      ),
    createItem: async (data: Record<string, unknown>) =>
      json<ApiItem>(await request.post("/api/inventory/", { data: { quantity: 1, location: "", ...data } }), 201),
    looks: async () => json<ApiLook[]>(await request.get("/api/looks/"), 200),
    look: async (id: string) => json<ApiLook>(await request.get(`/api/looks/${id}`), 200),
  };
}

export type Api = ReturnType<typeof api>;

export interface SeededItem extends ApiItem {
  group: "clothes" | "shoes" | "bags";
}

export interface Closet {
  /** By item name. */
  items: Record<string, SeededItem>;
  photoURL: string;
  /** Logical tag -> the per-user tag name actually stored (see seedCloset). */
  tags: Record<TagKey, string>;
}

export type TagKey = "linen" | "summer" | "denim" | "basic" | "canvas";

export const ITEM_NAMES = {
  linen: "Linen Shirt",
  denim: "Denim Jacket",
  tee: "Plain Tee",
  sneakers: "White Sneakers",
  tote: "Canvas Tote",
} as const;

/**
 * Seeds the closet used by every UI test. Photo items get the uploaded PNG as
 * both imageURL and cutoutURL: an item that already has a cutout is never
 * queued for client-side background removal (which would pull a multi-MB ML
 * model from a CDN), keeping the tests hermetic.
 */
export async function seedCloset(a: Api): Promise<Closet> {
  // Signup seeds the default categories; their Stylebook groups come from
  // model.DefaultStylebookGroup. Assert them before relying on them.
  const categories = await a.categories();
  const byName = new Map(categories.map((c) => [c.name, c]));
  expect(byName.get("Clothes")?.stylebookGroup).toBe("clothes");
  expect(byName.get("Shoes")?.stylebookGroup).toBe("shoes");
  expect(byName.get("Bags")?.stylebookGroup).toBe("bags");
  for (const hidden of ["Food", "Makeup", "Books"]) {
    expect(byName.get(hidden)?.stylebookGroup ?? null, `${hidden} is hidden by default`).toBeNull();
  }
  expect(byName.get("Clothes")!.subCategories.map((s) => s.name).sort()).toEqual(["Outerwear", "Tops"]);
  expect(byName.get("Shoes")!.subCategories.map((s) => s.name)).toEqual(["Sneakers"]);

  const { url: photoURL } = await a.upload(makePng(60, 90, [210, 120, 140]));
  expect(photoURL).toMatch(/^\/uploads\/[0-9a-f]{32}\.png$/);

  // Tag names are global in the backend and creating the same new tag name
  // from two sessions at once races (see stylebook-api.spec.ts, the fixme'd
  // "concurrent new tag" test), so each user gets its own tag names.
  const suffix = Math.random().toString(36).slice(2, 7);
  const tags = Object.fromEntries(
    (["linen", "summer", "denim", "basic", "canvas"] as TagKey[]).map((t) => [t, `${t}-${suffix}`]),
  ) as Record<TagKey, string>;

  const specs: { name: string; category: string; subcategory: string; tags: string[]; photo: boolean; group: SeededItem["group"] }[] = [
    { name: ITEM_NAMES.linen, category: "Clothes", subcategory: "Tops", tags: [tags.linen, tags.summer], photo: true, group: "clothes" },
    { name: ITEM_NAMES.denim, category: "Clothes", subcategory: "Outerwear", tags: [tags.denim], photo: true, group: "clothes" },
    { name: ITEM_NAMES.tee, category: "Clothes", subcategory: "Tops", tags: [tags.basic], photo: false, group: "clothes" },
    { name: ITEM_NAMES.sneakers, category: "Shoes", subcategory: "Sneakers", tags: [tags.summer], photo: true, group: "shoes" },
    { name: ITEM_NAMES.tote, category: "Bags", subcategory: "Handbags", tags: [tags.canvas], photo: true, group: "bags" },
  ];
  const items: Record<string, SeededItem> = {};
  for (const spec of specs) {
    const created = await a.createItem({
      name: spec.name,
      category: spec.category,
      subcategory: spec.subcategory,
      tags: spec.tags.map((name) => ({ name })),
      ...(spec.photo ? { imageURL: photoURL, cutoutURL: photoURL } : {}),
    });
    expect(created.categoryId).toBe(String(byName.get(spec.category)!.id));
    expect(created.tags.map((t) => t.name).sort()).toEqual([...spec.tags].sort());
    if (spec.photo) expect(created.imageURL).toBe(photoURL);
    else expect(created.imageURL ?? "").toBe("");
    items[spec.name] = { ...created, group: spec.group };
  }
  return { items, photoURL, tags };
}

type Fixtures = {
  /** Page signed in as a fresh user with a seeded closet. */
  authedPage: Page;
  /** API helpers carrying the same session as `authedPage`. */
  userApi: Api;
  closet: Closet;
};

export const test = base.extend<Fixtures>({
  // Hermetic browser: anything that isn't the e2e app origin is aborted (the
  // app has no legitimate third-party requests in these flows).
  context: async ({ context, baseURL }, provide) => {
    const origin = new URL(baseURL!).origin;
    await context.route(
      (url) => url.origin !== origin && url.protocol !== "data:" && url.protocol !== "blob:",
      (route) => route.abort(),
    );
    await provide(context);
  },
  userApi: async ({ page }, provide) => {
    const a = api(page.request);
    await a.signupAndLogin(uniqueEmail());
    await provide(a);
  },
  closet: async ({ userApi }, provide) => {
    await provide(await seedCloset(userApi));
  },
  authedPage: async ({ page, closet }, provide) => {
    void closet;
    await page.goto("/");
    // RequireAuth would bounce to /signin without a session.
    await expect(page).not.toHaveURL(/\/signin/);
    await provide(page);
  },
});

export { expect };
