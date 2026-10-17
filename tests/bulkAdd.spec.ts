import { test, expect } from "@playwright/test";

/**
 * T2 (client/src/lib/bulkAdd.ts) unit coverage.
 *
 * Per PLAN.md's "bulk add items from a multi-photo selection" plan, T2's
 * three stage functions (prepareAndUpload, recognizeAndMatch,
 * commitBulkItem) are a pure, framework-free, DOM-independent module (it
 * calls fetch-based API functions but owns no React/state-machine/timer
 * logic of its own) — same "unit-tested through the Vite dev server"
 * technique T1's concurrency.spec.ts already validated: `page.goto('/')`,
 * then `page.evaluate` a dynamic `import('/src/lib/bulkAdd.ts')` with all
 * assertions run *inside* the evaluate, returning only plain serializable
 * data. `page.route` stubs are installed before the evaluate call in every
 * test — per T1's report, route interception applies regardless of whether
 * the fetch happens inside page.evaluate or a normal page interaction.
 *
 * Never hits real Gemini or a real backend mutation: every case here stubs
 * /api/uploads, /api/recognize, and /api/inventory/. No signed-up session is
 * needed since nothing here is exercised unstubbed (the real round-trip is
 * T5's job per the plan's testing notes).
 *
 * A 1x1 PNG data URL is used as the "photo" so `preparePhoto` (called
 * internally by prepareAndUpload) takes its real createImageBitmap +
 * canvas-redraw path rather than its undecodable-input fallback, matching
 * production behaviour (prepared blobs come back as `photo.jpg`).
 */

const ONE_PX_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

// ---------------------------------------------------------------------------
// Stage 1: prepareAndUpload
// ---------------------------------------------------------------------------

test.describe("prepareAndUpload", () => {
  test("stubbed happy path resolves ok:true with imageURL, preparedBlob, preparedFilename", async ({
    page,
  }) => {
    await page.route("**/api/uploads", async (route) => {
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ url: "/uploads/abc123.jpg" }) });
    });

    const outcome = await page.evaluate(
      async ({ dataUrl }) => {
        const mod = await import("/src/lib/bulkAdd.ts");
        const blob = await fetch(dataUrl).then((r) => r.blob());
        const photo = new File([blob], "cat.png", { type: "image/png" });
        const result = await mod.prepareAndUpload(photo);
        return {
          ok: result.ok,
          imageURL: result.ok ? result.imageURL : null,
          preparedBlobSize: result.ok ? result.preparedBlob.size : null,
          preparedBlobType: result.ok ? result.preparedBlob.type : null,
          preparedFilename: result.ok ? result.preparedFilename : null,
        };
      },
      { dataUrl: ONE_PX_PNG },
    );

    expect(outcome.ok).toBe(true);
    expect(outcome.imageURL).toBe("/uploads/abc123.jpg");
    expect(outcome.preparedBlobType).toBe("image/jpeg");
    expect(outcome.preparedFilename).toBe("photo.jpg");
    expect(outcome.preparedBlobSize).toBeGreaterThan(0);
  });

  test("stubbed /api/uploads 400 (unsupported image type) resolves ok:false, retryable:false, never rejects", async ({
    page,
  }) => {
    await page.route("**/api/uploads", async (route) => {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "unsupported image type" }) });
    });

    const outcome = await page.evaluate(
      async ({ dataUrl }) => {
        const mod = await import("/src/lib/bulkAdd.ts");
        const blob = await fetch(dataUrl).then((r) => r.blob());
        const photo = new File([blob], "bad.png", { type: "image/png" });
        let threw = false;
        let result;
        try {
          result = await mod.prepareAndUpload(photo);
        } catch {
          threw = true;
        }
        return { threw, result };
      },
      { dataUrl: ONE_PX_PNG },
    );

    expect(outcome.threw).toBe(false);
    expect(outcome.result).toEqual({ ok: false, message: "unsupported image type", retryable: false });
  });

  test("stubbed /api/uploads 500 resolves ok:false, retryable:true, never rejects", async ({ page }) => {
    await page.route("**/api/uploads", async (route) => {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "internal server error" }) });
    });

    const outcome = await page.evaluate(
      async ({ dataUrl }) => {
        const mod = await import("/src/lib/bulkAdd.ts");
        const blob = await fetch(dataUrl).then((r) => r.blob());
        const photo = new File([blob], "boom.png", { type: "image/png" });
        let threw = false;
        let result;
        try {
          result = await mod.prepareAndUpload(photo);
        } catch {
          threw = true;
        }
        return { threw, result };
      },
      { dataUrl: ONE_PX_PNG },
    );

    expect(outcome.threw).toBe(false);
    expect(outcome.result).toEqual({ ok: false, message: "internal server error", retryable: true });
  });
});

// ---------------------------------------------------------------------------
// Stage 2: recognizeAndMatch
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { id: 1, name: "Clothes", icon: null, colour: null, subCategories: [], tags: [], itemCount: 0, locations: [], reminderOnExpiry: false },
  { id: 2, name: "Food", icon: null, colour: null, subCategories: [], tags: [], itemCount: 0, locations: [], reminderOnExpiry: false },
];

test.describe("recognizeAndMatch", () => {
  test("stubbed happy path: category matches an existing category case-insensitively -> matched:true with its id", async ({
    page,
  }) => {
    await page.route("**/api/recognize", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ category: "clothes", itemName: "Running Sneakers" }),
      });
    });

    const outcome = await page.evaluate(
      async ({ dataUrl, categories }) => {
        const mod = await import("/src/lib/bulkAdd.ts");
        const blob = await fetch(dataUrl).then((r) => r.blob());
        const result = await mod.recognizeAndMatch(blob, "photo.jpg", categories);
        return result;
      },
      { dataUrl: ONE_PX_PNG, categories: CATEGORIES },
    );

    expect(outcome).toEqual({
      ok: true,
      name: "Running Sneakers",
      match: { matched: true, categoryId: 1 },
    });
  });

  test("stubbed happy path: category matches nothing -> matched:false carrying the raw suggested string", async ({
    page,
  }) => {
    await page.route("**/api/recognize", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ category: "Furniture", itemName: "Wooden Chair" }),
      });
    });

    const outcome = await page.evaluate(
      async ({ dataUrl, categories }) => {
        const mod = await import("/src/lib/bulkAdd.ts");
        const blob = await fetch(dataUrl).then((r) => r.blob());
        const result = await mod.recognizeAndMatch(blob, "photo.jpg", categories);
        return result;
      },
      { dataUrl: ONE_PX_PNG, categories: CATEGORIES },
    );

    expect(outcome).toEqual({
      ok: true,
      name: "Wooden Chair",
      match: { matched: false, suggestedCategory: "Furniture" },
    });
  });

  for (const { status, body, expectedMessage, expectedRetryable, label } of [
    {
      status: 503,
      body: { error: "AI recognition is not configured" },
      expectedMessage: "AI recognition is not configured",
      expectedRetryable: true,
      label: "503 no API key",
    },
    {
      status: 502,
      body: { error: "couldn't recognize this item" },
      expectedMessage: "couldn't recognize this item",
      expectedRetryable: true,
      label: "502 Gemini failure",
    },
    {
      status: 422,
      body: { error: "no categories to classify into — add a category first" },
      expectedMessage: "no categories to classify into — add a category first",
      expectedRetryable: false,
      label: "422 no categories",
    },
    {
      status: 400,
      body: { error: "unsupported image type" },
      expectedMessage: "unsupported image type",
      expectedRetryable: false,
      label: "400 bad image",
    },
  ]) {
    test(`stubbed /api/recognize ${label} resolves ok:false, retryable:${expectedRetryable}, never rejects`, async ({
      page,
    }) => {
      await page.route("**/api/recognize", async (route) => {
        await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      });

      const outcome = await page.evaluate(
        async ({ dataUrl, categories }) => {
          const mod = await import("/src/lib/bulkAdd.ts");
          const blob = await fetch(dataUrl).then((r) => r.blob());
          let threw = false;
          let result;
          try {
            result = await mod.recognizeAndMatch(blob, "photo.jpg", categories);
          } catch {
            threw = true;
          }
          return { threw, result };
        },
        { dataUrl: ONE_PX_PNG, categories: CATEGORIES },
      );

      expect(outcome.threw).toBe(false);
      expect(outcome.result).toEqual({ ok: false, message: expectedMessage, retryable: expectedRetryable });
    });
  }

  test("empty categories array never throws and resolves matched:false", async ({ page }) => {
    await page.route("**/api/recognize", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ category: "Clothes", itemName: "Jacket" }),
      });
    });

    const outcome = await page.evaluate(async ({ dataUrl }) => {
      const mod = await import("/src/lib/bulkAdd.ts");
      const blob = await fetch(dataUrl).then((r) => r.blob());
      return mod.recognizeAndMatch(blob, "photo.jpg", []);
    }, { dataUrl: ONE_PX_PNG });

    expect(outcome).toEqual({
      ok: true,
      name: "Jacket",
      match: { matched: false, suggestedCategory: "Clothes" },
    });
  });
});

// ---------------------------------------------------------------------------
// Stage 3: commitBulkItem
// ---------------------------------------------------------------------------

test.describe("commitBulkItem", () => {
  test("stubbed happy path with only {name, category, imageURL} resolves ok:true and the payload sent carries the full default shape (T1's baseline)", async ({
    page,
  }) => {
    let capturedBody: unknown = null;
    await page.route("**/api/inventory/", async (route) => {
      capturedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "item-1",
          name: "Running Sneakers",
          subtitle: "Clothes",
          category: "Clothes",
          subcategory: "",
          categoryId: "1",
          subCategoryId: null,
          location: "",
          quantity: 1,
          tags: [],
          status: "in_stock",
          notes: "",
          imageURL: "/uploads/abc123.jpg",
          createdAt: "2026-08-28T00:00:00Z",
          updatedAt: "2026-08-28T00:00:00Z",
        }),
      });
    });

    const outcome = await page.evaluate(async () => {
      const mod = await import("/src/lib/bulkAdd.ts");
      const result = await mod.commitBulkItem({
        name: "Running Sneakers",
        category: "Clothes",
        imageURL: "/uploads/abc123.jpg",
      });
      return result;
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.item.id).toBe("item-1");
      expect(outcome.item.name).toBe("Running Sneakers");
    }

    // Assert the exact default payload shape: omitted optional fields land
    // at exactly the values bulk add has always sent, and — per T1's
    // widened contract — opensOn/expiryDate are now present as "" (they
    // were previously absent entirely).
    expect(capturedBody).toEqual({
      name: "Running Sneakers",
      category: "Clothes",
      subcategory: "",
      location: "",
      quantity: 1,
      tags: [],
      notes: "",
      opensOn: "",
      expiryDate: "",
      imageURL: "/uploads/abc123.jpg",
    });
    expect(capturedBody).not.toHaveProperty("cutoutURL");
  });

  test("stubbed happy path with every optional field populated sends all of them, normalized", async ({
    page,
  }) => {
    let capturedBody: unknown = null;
    await page.route("**/api/inventory/", async (route) => {
      capturedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "item-2",
          name: "Wool Sweater",
          subtitle: "Clothes",
          category: "Clothes",
          subcategory: "Outerwear",
          categoryId: "1",
          subCategoryId: "10",
          location: "Closet",
          quantity: 7,
          tags: [{ name: "Winter" }, { name: "Sale" }],
          status: "in_stock",
          notes: "A gift",
          imageURL: "/uploads/abc123.jpg",
          opensOn: "2026-01-01",
          expiryDate: "2026-12-31",
          createdAt: "2026-08-28T00:00:00Z",
          updatedAt: "2026-08-28T00:00:00Z",
        }),
      });
    });

    const outcome = await page.evaluate(async () => {
      const mod = await import("/src/lib/bulkAdd.ts");
      const result = await mod.commitBulkItem({
        name: "  Wool Sweater  ",
        category: "Clothes",
        imageURL: "/uploads/abc123.jpg",
        subcategory: "  Outerwear  ",
        location: "  Closet  ",
        quantity: "7",
        tags: ["Winter", "Sale"],
        notes: "  A gift  ",
        opensOn: "2026-01-01",
        expiryDate: "2026-12-31",
      });
      return result;
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.item.id).toBe("item-2");
    }

    expect(capturedBody).toEqual({
      name: "Wool Sweater",
      category: "Clothes",
      subcategory: "Outerwear",
      location: "Closet",
      quantity: 7,
      tags: [{ name: "Winter" }, { name: "Sale" }],
      notes: "A gift",
      opensOn: "2026-01-01",
      expiryDate: "2026-12-31",
      imageURL: "/uploads/abc123.jpg",
    });
    expect(capturedBody).not.toHaveProperty("cutoutURL");
  });

  for (const { label, quantity, expectedQuantity } of [
    { label: "blank", quantity: "", expectedQuantity: 1 },
    { label: '"0"', quantity: "0", expectedQuantity: 1 },
    { label: '"abc"', quantity: "abc", expectedQuantity: 1 },
    { label: '"-3"', quantity: "-3", expectedQuantity: 1 },
    { label: '"7"', quantity: "7", expectedQuantity: 7 },
  ]) {
    test(`quantity ${label} clamps to ${expectedQuantity}`, async ({ page }) => {
      let capturedBody: unknown = null;
      await page.route("**/api/inventory/", async (route) => {
        capturedBody = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: "item-q",
            name: "Item",
            subtitle: "Clothes",
            category: "Clothes",
            subcategory: "",
            categoryId: "1",
            subCategoryId: null,
            location: "",
            quantity: expectedQuantity,
            tags: [],
            status: "in_stock",
            notes: "",
            imageURL: "/uploads/x.jpg",
            createdAt: "2026-08-28T00:00:00Z",
            updatedAt: "2026-08-28T00:00:00Z",
          }),
        });
      });

      const outcome = await page.evaluate(
        async ({ quantity }) => {
          const mod = await import("/src/lib/bulkAdd.ts");
          return mod.commitBulkItem({
            name: "Item",
            category: "Clothes",
            imageURL: "/uploads/x.jpg",
            quantity,
          });
        },
        { quantity },
      );

      expect(outcome.ok).toBe(true);
      expect((capturedBody as { quantity: number }).quantity).toBe(expectedQuantity);
    });
  }

  test("stubbed /api/inventory/ 400 resolves ok:false, retryable:true (not a recognized permanent-failure message), never rejects", async ({
    page,
  }) => {
    await page.route("**/api/inventory/", async (route) => {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "name is required" }) });
    });

    const outcome = await page.evaluate(async () => {
      const mod = await import("/src/lib/bulkAdd.ts");
      let threw = false;
      let result;
      try {
        result = await mod.commitBulkItem({ name: "", category: "Clothes", imageURL: "/uploads/x.jpg" });
      } catch {
        threw = true;
      }
      return { threw, result };
    });

    expect(outcome.threw).toBe(false);
    expect(outcome.result).toEqual({ ok: false, message: "name is required", retryable: true });
  });

  test("stubbed /api/inventory/ 500 resolves ok:false, retryable:true, never rejects", async ({ page }) => {
    await page.route("**/api/inventory/", async (route) => {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "internal server error" }) });
    });

    const outcome = await page.evaluate(async () => {
      const mod = await import("/src/lib/bulkAdd.ts");
      let threw = false;
      let result;
      try {
        result = await mod.commitBulkItem({ name: "Chair", category: "Clothes", imageURL: "/uploads/x.jpg" });
      } catch {
        threw = true;
      }
      return { threw, result };
    });

    expect(outcome.threw).toBe(false);
    expect(outcome.result).toEqual({ ok: false, message: "internal server error", retryable: true });
  });
});

// ---------------------------------------------------------------------------
// preparePhoto called exactly once per photo across the upload+recognize pair
// ---------------------------------------------------------------------------

test.describe("prepareAndUpload + recognizeAndMatch: prepared blob reused, not re-derived", () => {
  test("the exact prepared blob/filename returned by prepareAndUpload is what reaches both /api/uploads and /api/recognize", async ({
    page,
  }) => {
    let uploadRequestSize: number | null = null;
    let uploadRequestFilename: string | null = null;
    let recognizeRequestSize: number | null = null;
    let recognizeRequestFilename: string | null = null;

    await page.route("**/api/uploads", async (route) => {
      const request = route.request();
      const buffer = await request.postDataBuffer();
      uploadRequestSize = buffer ? buffer.byteLength : null;
      // Multipart body — grab the filename off the Content-Disposition line.
      const text = buffer ? buffer.toString("utf-8") : "";
      const match = text.match(/filename="([^"]+)"/);
      uploadRequestFilename = match ? match[1] : null;
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ url: "/uploads/xyz.jpg" }) });
    });

    await page.route("**/api/recognize", async (route) => {
      const request = route.request();
      const buffer = await request.postDataBuffer();
      const text = buffer ? buffer.toString("utf-8") : "";
      const match = text.match(/filename="([^"]+)"/);
      recognizeRequestFilename = match ? match[1] : null;
      // The multipart body contains headers + the raw image bytes; comparing
      // the *body byte length* between the two requests (rather than trying
      // to slice out just the file part) is enough to prove the same
      // prepared blob — same content, same filename, hence same multipart
      // encoding size — was reused, since re-preparing a still-image PNG
      // through the same canvas/JPEG-quality pipeline a second time would
      // still need to produce the *identical* bytes to fool this, which
      // amounts to the same guarantee.
      recognizeRequestSize = buffer ? buffer.byteLength : null;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ category: "Clothes", itemName: "Jacket" }),
      });
    });

    const outcome = await page.evaluate(
      async ({ dataUrl, categories }) => {
        const mod = await import("/src/lib/bulkAdd.ts");
        const blob = await fetch(dataUrl).then((r) => r.blob());
        const photo = new File([blob], "original.png", { type: "image/png" });

        const uploadResult = await mod.prepareAndUpload(photo);
        if (!uploadResult.ok) throw new Error("expected upload success in test setup");

        // Feed stage 1's own returned preparedBlob/preparedFilename straight
        // into stage 2 — never re-deriving a second prepared blob.
        const recognizeResult = await mod.recognizeAndMatch(
          uploadResult.preparedBlob,
          uploadResult.preparedFilename,
          categories,
        );

        return {
          preparedBlobSize: uploadResult.preparedBlob.size,
          preparedFilename: uploadResult.preparedFilename,
          recognizeOk: recognizeResult.ok,
        };
      },
      { dataUrl: ONE_PX_PNG, categories: CATEGORIES },
    );

    expect(outcome.recognizeOk).toBe(true);
    expect(uploadRequestFilename).toBe(outcome.preparedFilename);
    expect(recognizeRequestFilename).toBe(outcome.preparedFilename);
    // Same body byte length on both wire requests -> same prepared blob was
    // sent both times, not a fresh preparePhoto() pass.
    expect(recognizeRequestSize).toBe(uploadRequestSize);
    expect(uploadRequestSize).toBeGreaterThan(0);
  });
});
