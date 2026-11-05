// API tests for the Stylebook-related endpoints (categories' stylebookGroup
// and the looks' 400x711 coordinates). Uses the `request` fixture through the
// e2e Vite proxy (same origin the SPA uses); runs in the desktop project only.
import { request as playwrightRequest } from "@playwright/test";
import { test, expect, api, uniqueEmail, PASSWORD } from "./fixtures";
import { APP_URL } from "./support/stack";

test.describe("categories: stylebookGroup", () => {
  test.beforeEach(async ({ request }) => {
    await api(request).signupAndLogin(uniqueEmail("api"));
  });

  test("PUT with an invalid stylebookGroup is rejected with 400 and changes nothing", async ({ request }) => {
    const clothes = await api(request).category("Clothes");
    for (const bad of ["hats", "Clothes", " clothes", "null"]) {
      const res = await request.put(`/api/categories/${clothes.id}`, { data: { name: "Clothes", stylebookGroup: bad } });
      expect(res.status(), `stylebookGroup ${JSON.stringify(bad)}`).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid stylebookGroup" });
    }
    const wrongType = await request.put(`/api/categories/${clothes.id}`, { data: { name: "Clothes", stylebookGroup: 5 } });
    expect(wrongType.status()).toBe(400);
    expect((await api(request).category("Clothes")).stylebookGroup).toBe("clothes");
  });

  test("PUT without stylebookGroup keeps it; \"\" stores null; a valid value is stored", async ({ request }) => {
    const a = api(request);
    const shoes = await a.category("Shoes");

    const renamed = await a.putCategory(shoes.id, { name: "Footwear & Shoes" });
    expect(renamed.stylebookGroup).toBe("shoes");
    expect((await a.category("Footwear & Shoes")).stylebookGroup).toBe("shoes");

    const hidden = await a.putCategory(shoes.id, { name: "Footwear & Shoes", stylebookGroup: "" });
    expect(hidden.stylebookGroup).toBeNull();
    expect((await a.category("Footwear & Shoes")).stylebookGroup).toBeNull();

    // Omitting it again keeps null (not the name-derived default).
    expect((await a.putCategory(shoes.id, { name: "Shoes" })).stylebookGroup).toBeNull();

    const set = await a.putCategory(shoes.id, { name: "Shoes", stylebookGroup: "accessories" });
    expect(set.stylebookGroup).toBe("accessories");
    expect((await a.category("Shoes")).stylebookGroup).toBe("accessories");
  });

  test("POST stores an explicit group, derives one when omitted, and validates", async ({ request }) => {
    const create = (data: Record<string, unknown>) => request.post("/api/categories/", { data });

    const explicit = await create({ name: "Weekend Stuff", stylebookGroup: "bags" });
    expect(explicit.status()).toBe(201);
    expect((await explicit.json()).stylebookGroup).toBe("bags");
    expect((await api(request).category("Weekend Stuff")).stylebookGroup).toBe("bags");

    const derived = await create({ name: "Accessories" });
    expect(derived.status()).toBe(201);
    expect((await derived.json()).stylebookGroup).toBe("accessories");

    const noMatch = await create({ name: "Garden Tools" });
    expect(noMatch.status()).toBe(201);
    expect((await noMatch.json()).stylebookGroup).toBeNull();

    const hiddenExplicit = await create({ name: "Bag Charms", stylebookGroup: "" });
    expect(hiddenExplicit.status()).toBe(201);
    expect((await hiddenExplicit.json()).stylebookGroup).toBeNull();

    const invalid = await create({ name: "Hats", stylebookGroup: "hats" });
    expect(invalid.status()).toBe(400);
    expect(await invalid.json()).toEqual({ error: "invalid stylebookGroup" });

    const unnamed = await create({ name: "", stylebookGroup: "bags" });
    expect(unnamed.status()).toBe(400);
  });

  test("category endpoints require a session", async () => {
    const anon = await playwrightRequest.newContext({ baseURL: APP_URL });
    try {
      expect((await anon.get("/api/categories/")).status()).toBe(401);
      expect((await anon.put("/api/categories/1", { data: { name: "x", stylebookGroup: "bags" } })).status()).toBe(401);
    } finally {
      await anon.dispose();
    }
  });
});

test.describe("looks: 400x711 coordinates", () => {
  test("POST then GET (and PUT then GET) return identical transforms; validation errors", async ({ request }) => {
    const a = api(request);
    await a.signupAndLogin(uniqueEmail("looks"));
    const shirt = await a.createItem({ name: "Shirt", category: "Clothes", subcategory: "Tops", tags: [] });
    const shoe = await a.createItem({ name: "Shoe", category: "Shoes", subcategory: "Sneakers", tags: [] });

    const items = [
      { itemId: shirt.id, x: 0, y: 0, width: 400, height: 711, rotation: 0, zIndex: 0 },
      { itemId: shoe.id, x: 123.456789, y: 598.125, width: 87.5, height: 112.875, rotation: -17.25, zIndex: 2001 },
      { itemId: shirt.id, x: 200.0000001, y: 355.5, width: 133.33333333333331, height: 200, rotation: 359.9, zIndex: 3 },
    ];
    const created = await request.post("/api/looks/", { data: { name: "Round trip", occasion: "Work", items } });
    expect(created.status()).toBe(201);
    const look = await created.json();
    const strip = (list: typeof items) =>
      list.map(({ itemId, x, y, width, height, rotation, zIndex }) => ({ itemId, x, y, width, height, rotation, zIndex }));
    const byZ = (list: typeof items) => [...list].sort((p, q) => p.zIndex - q.zIndex);
    expect(strip(look.items)).toEqual(byZ(items));

    const fetched = await a.look(look.id);
    expect(fetched.name).toBe("Round trip");
    expect(fetched.occasion).toBe("Work");
    expect(strip(fetched.items as typeof items)).toEqual(byZ(items));
    expect(fetched.items.find((i) => i.itemId === shirt.id)?.name).toBe("Shirt");

    const moved = items.map((i) => ({ ...i, x: i.x / 2, y: 711 - i.height }));
    const put = await request.put(`/api/looks/${look.id}`, { data: { name: "Round trip 2", occasion: "", items: moved } });
    expect(put.status()).toBe(200);
    const refetched = await a.look(look.id);
    expect(refetched.name).toBe("Round trip 2");
    expect(strip(refetched.items as typeof items)).toEqual(byZ(moved));

    // Errors.
    const noName = await request.post("/api/looks/", { data: { name: "  ", items } });
    expect(noName.status()).toBe(400);
    expect(await noName.json()).toEqual({ error: "name is required" });
    const noItems = await request.post("/api/looks/", { data: { name: "Empty", items: [] } });
    expect(noItems.status()).toBe(400);
    expect(await noItems.json()).toEqual({ error: "at least one item is required" });
    const badItem = await request.post("/api/looks/", { data: { name: "Bad", items: [{ ...items[0], itemId: "999999999" }] } });
    expect(badItem.status()).toBe(400);
    const malformed = await request.post("/api/looks/", { data: "{not json", headers: { "Content-Type": "application/json" } });
    expect(malformed.status()).toBe(400);
    expect((await request.get("/api/looks/999999999")).status()).toBe(404);
  });

  test("another user's look is not visible (404)", async ({ request }) => {
    const owner = api(request);
    await owner.signupAndLogin(uniqueEmail("owner"));
    const item = await owner.createItem({ name: "Mine", category: "Clothes", subcategory: "Tops", tags: [] });
    const created = await request.post("/api/looks/", {
      data: { name: "Private", items: [{ itemId: item.id, x: 1, y: 2, width: 3, height: 4, rotation: 0, zIndex: 0 }] },
    });
    expect(created.status()).toBe(201);
    const { id } = await created.json();

    const other = await playwrightRequest.newContext({ baseURL: APP_URL });
    try {
      await api(other).signupAndLogin(uniqueEmail("other"));
      expect((await other.get(`/api/looks/${id}`)).status()).toBe(404);
      const steal = await other.post("/api/looks/", {
        data: { name: "Steal", items: [{ itemId: item.id, x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0 }] },
      });
      expect(steal.status()).toBe(400);
    } finally {
      await other.dispose();
    }
  });
});

test.describe("inventory tags", () => {
  // PRODUCT BUG (backend): two sessions creating items that introduce the
  // same brand-new tag name at the same moment race in ensureTag
  // (backend/internal/service/inventory_service.go:366-374: SELECT by name,
  // then a plain INSERT with no ON CONFLICT), so the loser gets
  // 500 "duplicate key value violates unique constraint itemtags_name_unique".
  // First seen when two Playwright workers seeded the same tag names in
  // parallel. Re-enable once ensureTag is race-safe.
  test.fixme("concurrent creation of the same new tag name by two users succeeds for both", async () => {
    const contexts = await Promise.all([0, 1, 2, 3].map(() => playwrightRequest.newContext({ baseURL: APP_URL })));
    try {
      await Promise.all(contexts.map((c) => api(c).signupAndLogin(uniqueEmail("race"), PASSWORD)));
      for (let round = 0; round < 5; round++) {
        const tag = `race-${Date.now()}-${round}`;
        const statuses = await Promise.all(
          contexts.map(async (c) =>
            (
              await c.post("/api/inventory/", {
                data: { name: "Racer", category: "Clothes", subcategory: "Tops", quantity: 1, tags: [{ name: tag }] },
              })
            ).status(),
          ),
        );
        expect(statuses).toEqual([201, 201, 201, 201]);
      }
    } finally {
      await Promise.all(contexts.map((c) => c.dispose()));
    }
  });
});
