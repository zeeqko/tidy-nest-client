// Helpers for reading and driving the Konva canvas and the picker.
//
// Konva registers itself as `window.Konva` and tracks every live Stage in
// `Konva.stages`, which lets tests read each placed node's logical transform
// (the Stage is scaled, so node attributes are in the 400x711 design space)
// without adding test hooks to product code. A placed node's Konva x/y is
// its box centre (offset = half size, see OutfitCanvas PlacedNode), so the
// stored top-left is x - offsetX. The layer holds only the placed pieces
// (Konva.Image) plus, when interactive, the Transformer, which every helper
// below skips. The 400x711 base space is not drawn (no board/frame node);
// its on-screen rect is derived from the stage's scale/offset instead. In the
// builder, pieces may use the whole panel: they are kept inside the panel's
// visible logical rect (see `viewInfo`), so stored coordinates can be
// negative or beyond 400/711.
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface CanvasNode {
  cls: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string | null;
  /** Whether a Konva.Image node has its picture loaded (false while it still
   *  draws the fallback fill). */
  hasImage?: boolean;
  /** Absolute URL of the picture a Konva.Image node draws (null while it
   *  draws the fallback fill). */
  imageSrc?: string | null;
}

export interface Point {
  x: number;
  y: number;
}

export const DESIGN_WIDTH = 400;
export const DESIGN_HEIGHT = 711;

/** On-screen rect of the (undrawn) 400x711 logical space, in stage /
 *  container pixels, derived from the stage transform (logical (0, 0) maps
 *  to the stage offset; 400x711 is scaled by the stage scale), plus the
 *  stage size. */
export async function logicalSpaceInfo(page: Page, stageIndex = 0) {
  return page.evaluate(
    ([index, w, h]) => {
      const stage = (window as any).Konva.stages[index];
      return {
        client: { x: stage.x(), y: stage.y(), width: w * stage.scaleX(), height: h * stage.scaleY() },
        stage: { width: stage.width(), height: stage.height() },
      };
    },
    [stageIndex, DESIGN_WIDTH, DESIGN_HEIGHT] as const,
  );
}

/** The stage's view: its scale/offset, size, the panel's visible logical
 *  rect (what the stage shows, in logical units: pieces are clamped into it)
 *  and `baseScale`, the contain-fit scale of the 400x711 base space for this
 *  stage size (the builder zooms out below it only to show every piece). */
export async function viewInfo(page: Page, stageIndex = 0) {
  return page.evaluate(
    ([index, w, h]) => {
      const stage = (window as any).Konva.stages[index];
      const scale = stage.scaleX();
      return {
        scale,
        offsetX: stage.x(),
        offsetY: stage.y(),
        stage: { width: stage.width(), height: stage.height() },
        visible: { x: -stage.x() / scale, y: -stage.y() / scale, width: stage.width() / scale, height: stage.height() / scale },
        baseScale: Math.min(stage.width() / w, stage.height() / h),
      };
    },
    [stageIndex, DESIGN_WIDTH, DESIGN_HEIGHT] as const,
  );
}

/** Every node of the stage that is not its Layer, a placed piece
 *  (Konva.Image) or the Transformer (or part of it): a board, frame or any other backdrop
 *  shape would show up here. Empty when the canvas draws only the pieces. */
export async function nonPieceNodes(page: Page, stageIndex = 0) {
  return page.evaluate((index) => {
    const stage = (window as any).Konva.stages[index];
    return stage
      .find(
        (n: any) =>
          !["Layer", "Image", "Transformer"].includes(n.getClassName()) && !n.findAncestor("Transformer"),
      )
      .map((n: any) => `${n.getClassName()}${n.name() ? `.${n.name()}` : ""}`)
      .concat(stage.findOne(".board") ? ["named board"] : []);
  }, stageIndex);
}

/** Placed nodes of the stage at `stageIndex`, in layer (z) order. */
export async function canvasNodes(page: Page, stageIndex = 0): Promise<CanvasNode[]> {
  return page.evaluate((index) => {
    const Konva = (window as any).Konva;
    const stage = Konva?.stages?.[index];
    if (!stage) return [];
    const layer = stage.getLayers()[0];
    return layer.getChildren().filter((n: any) => n.getClassName() !== "Transformer").map((n: any) => ({
      cls: n.getClassName(),
      x: n.x() - n.offsetX(),
      y: n.y() - n.offsetY(),
      width: n.width(),
      height: n.height(),
      rotation: n.rotation(),
      fill: typeof n.fill === "function" ? (n.fill() ?? null) : null,
      hasImage: typeof n.image === "function" ? Boolean(n.image()) : false,
      imageSrc: typeof n.image === "function" && n.image() ? (n.image().src ?? null) : null,
    }));
  }, stageIndex);
}

export async function stageTransform(page: Page, stageIndex = 0) {
  return page.evaluate((index) => {
    const stage = (window as any).Konva.stages[index];
    return { x: stage.x(), y: stage.y(), scaleX: stage.scaleX(), scaleY: stage.scaleY(), width: stage.width(), height: stage.height() };
  }, stageIndex);
}

/** Viewport point at the centre of the placed node at `nodeIndex` (layer order). */
export async function nodeScreenCenter(page: Page, nodeIndex: number, stageIndex = 0): Promise<Point> {
  return page.evaluate(
    ([si, ni]) => {
        const stage = (window as any).Konva.stages[si];
        const nodes = stage.getLayers()[0].getChildren().filter((n: any) => n.getClassName() !== "Transformer");
      const abs = nodes[ni].getAbsolutePosition();
      const rect = stage.container().getBoundingClientRect();
      return { x: rect.left + abs.x, y: rect.top + abs.y };
    },
    [stageIndex, nodeIndex] as const,
  );
}

/** Viewport point at the centre of the Transformer's rotate handle (an item must be selected). */
export async function rotaterPoint(page: Page, stageIndex = 0): Promise<Point> {
  const point = await page.evaluate((index) => {
    const stage = (window as any).Konva.stages[index];
    const rotater = stage.findOne("Transformer")?.findOne(".rotater");
    if (!rotater || !rotater.isVisible()) return null;
    const r = rotater.getClientRect();
    const rect = stage.container().getBoundingClientRect();
    return { x: rect.left + r.x + r.width / 2, y: rect.top + r.y + r.height / 2 };
  }, stageIndex);
  expect(point, "rotate handle is shown for the selected piece").not.toBeNull();
  return point!;
}

/** Viewport point at the centre of a Transformer anchor (e.g. "top-left") of the selected piece. */
export async function anchorPoint(page: Page, anchor: string, stageIndex = 0): Promise<Point> {
  const point = await page.evaluate(
    ([index, name]) => {
      const stage = (window as any).Konva.stages[index];
      const node = stage.findOne("Transformer")?.findOne(`.${name}`);
      if (!node || !node.isVisible()) return null;
      const r = node.getClientRect();
      const rect = stage.container().getBoundingClientRect();
      return { x: rect.left + r.x + r.width / 2, y: rect.top + r.y + r.height / 2 };
    },
    [stageIndex, anchor] as const,
  );
  expect(point, `${anchor} anchor is shown for the selected piece`).not.toBeNull();
  return point!;
}

/** The selected piece's Transformer: its `enabledAnchors()` and which corner
 *  anchor nodes are actually visible (null when nothing is selected). */
export async function transformerAnchors(page: Page, stageIndex = 0) {
  return page.evaluate((index) => {
    const tr = (window as any).Konva.stages[index].findOne("Transformer");
    if (!tr || tr.nodes().length === 0) return null;
    const corners = ["top-left", "top-right", "bottom-left", "bottom-right"];
    return {
      enabled: [...tr.enabledAnchors()].sort() as string[],
      visibleCorners: corners.filter((name) => tr.findOne(`.${name}`)?.isVisible()).sort(),
      rotater: Boolean(tr.findOne(".rotater")?.isVisible()),
    };
  }, stageIndex);
}

/** Each placed node's on-screen (stage-relative, scaled) client rect plus the stage size. */
export async function nodeClientRects(page: Page, stageIndex = 0) {
  return page.evaluate((index) => {
    const stage = (window as any).Konva.stages[index];
    const nodes = stage.getLayers()[0].getChildren().filter((n: any) => n.getClassName() !== "Transformer");
    const container = stage.container().getBoundingClientRect();
    return {
      stage: { width: stage.width(), height: stage.height() },
      container: { x: container.left, y: container.top, width: container.width, height: container.height },
        rects: nodes.map((n: any) => n.getClientRect({ skipStroke: true, skipShadow: true })),
    };
  }, stageIndex);
}

/**
 * A viewport point over empty canvas: inside the 400x711 design area and at
 * least `margin` px away from every placed node.
 */
export async function emptyCanvasPoint(page: Page, margin = 40): Promise<Point> {
  const point = await page.evaluate((m) => {
    const stage = (window as any).Konva.stages[0];
    const rect = stage.container().getBoundingClientRect();
    const top = rect.top + stage.y();
    const bottomLimit = Math.min(rect.bottom, top + 711 * stage.scaleY()) - m;
    const nodes = stage.getLayers()[0].getChildren().filter((n: any) => n.getClassName() !== "Transformer");
    const boxes = nodes.map((n: any) => n.getClientRect());
    const left = rect.left + stage.x();
    const right = left + 400 * stage.scaleX();
    for (let y = Math.max(rect.top, top) + m; y < bottomLimit; y += 10) {
      for (let x = left + m; x < right - m; x += 10) {
        const sx = x - rect.left;
        const sy = y - rect.top;
        const clear = boxes.every(
                (b: any) => sx < b.x - m || sx > b.x + b.width + m || sy < b.y - m || sy > b.y + b.height + m,
        );
        if (clear && !stage.getIntersection({ x: sx, y: sy })) return { x, y };
      }
    }
    return null;
  }, margin);
  expect(point, "found an empty spot on the canvas").not.toBeNull();
  return point!;
}

/** Mouse drag with intermediate moves. */
export async function mouseDrag(page: Page, from: Point, to: Point, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + (to.x - from.x) / steps, from.y + (to.y - from.y) / steps, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

/** Single-finger touch drag through the real input pipeline (CDP touch events). */
export async function touchDrag(page: Page, from: Point, to: Point, steps = 12) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (p: Point) => [{ x: p.x, y: p.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touch(from) });
  for (let i = 1; i <= steps; i++) {
    const p = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touch(p) });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** Presses on `from` (mouse on desktop projects, one finger via CDP on touch
 *  projects) and returns controls to move the held pointer and release it. */
export async function pointerHold(page: Page, testInfo: TestInfo, from: Point) {
  let at = from;
  if (testInfo.project.use.hasTouch) {
    const cdp = await page.context().newCDPSession(page);
    const touch = (p: Point) => [{ x: p.x, y: p.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touch(from) });
    return {
      async moveTo(to: Point, steps = 12) {
        const start = at;
        for (let i = 1; i <= steps; i++) {
          const p = { x: start.x + ((to.x - start.x) * i) / steps, y: start.y + ((to.y - start.y) * i) / steps };
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touch(p) });
          await page.waitForTimeout(16);
        }
        at = to;
      },
      async release() {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await cdp.detach();
      },
    };
  }
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  return {
    async moveTo(to: Point, steps = 12) {
      await page.mouse.move(to.x, to.y, { steps });
      at = to;
    },
    async release() {
      await page.mouse.up();
    },
  };
}

/** Mouse drag on desktop projects, touch drag on touch projects. */
export async function pointerDrag(page: Page, testInfo: TestInfo, from: Point, to: Point, steps = 12) {
  if (testInfo.project.use.hasTouch) await touchDrag(page, from, to, steps);
  else await mouseDrag(page, from, to, steps);
}

/** Two-finger pinch (zoom-in) gesture centred on `at`, via CDP. */
export async function pinch(page: Page, at: Point, scaleFactor = 2) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.synthesizePinchGesture", {
    x: at.x,
    y: at.y,
    scaleFactor,
    relativeSpeed: 400,
    gestureSourceType: "touch",
  });
  await cdp.detach();
}

/** Touch-driven scroll gesture (finger moves by distance), via CDP. */
export async function touchScrollGesture(page: Page, at: Point, yDistance: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.synthesizeScrollGesture", {
    x: at.x,
    y: at.y,
    yDistance,
    speed: 800,
    gestureSourceType: "touch",
    preventFling: true,
  });
  await cdp.detach();
}

// ---- Page locators --------------------------------------------------------

export const picker = (page: Page) => page.getByRole("region", { name: "Add pieces" });
export const canvasPanel = (page: Page) => page.getByTestId("builder-canvas-area");
export const pickerPanel = (page: Page) => page.getByTestId("builder-picker-panel");
export const pickerScroller = (page: Page) => picker(page).getByTestId("picker-grid-scroller");
export const addTile = (page: Page, name: string) => picker(page).getByRole("button", { name: `Add ${name}`, exact: true });
export const countBadge = (page: Page, name: string) =>
  picker(page).getByRole("button", { name: new RegExp(`^Remove last ${name} from canvas`) });

/** Opens the builder and waits for the picker to finish loading. */
export async function openBuilder(page: Page, url = "/stylebook/create") {
  await page.goto(url);
  await expect(picker(page)).toBeVisible();
  await expect(picker(page).getByText("Loading your closet…")).toHaveCount(0);
}

/** Taps a tile and waits until the number of placed pieces reaches `expectedTotal`. */
export async function addPiece(page: Page, name: string, expectedTotal: number) {
  await addTile(page, name).click();
  await expect.poll(async () => (await canvasNodes(page)).length).toBe(expectedTotal);
  await expect(countBadge(page, name)).toBeVisible();
}

/** The builder's cutout progress region (top-left of the canvas panel). */
export const cutoutStatus = (page: Page) => canvasPanel(page).getByTestId("cutout-status");
/** Undo / Redo via the builder's keyboard shortcuts (the header has no
 *  buttons). Focus must not be in a text field; the e2e browser is Chromium. */
export const pressUndo = (page: Page) => page.keyboard.press("Control+z");
export const pressRedo = (page: Page) => page.keyboard.press("Control+Shift+z");

/** The interactive canvas container (the ✕ and the pill are overlaid in it). */
export const outfitCanvas = (page: Page) => page.getByTestId("outfit-canvas");
/** The selected piece's red remove ✕ (scoped to the canvas: the picker's
 *  count badges are also named "Remove last …"). */
export const removeCross = (page: Page) => outfitCanvas(page).getByRole("button", { name: /^Remove / });
/** The selection pill (send to back / bring to front). */
export const selectionPill = (page: Page) => outfitCanvas(page).getByRole("toolbar", { name: /actions$/ });

/** Viewport rect of the placed node at `nodeIndex` (layer order): its rotated, axis-aligned bounding box, stroke excluded. */
export async function nodeScreenRect(page: Page, nodeIndex: number, stageIndex = 0) {
  return page.evaluate(
    ([si, ni]) => {
      const stage = (window as any).Konva.stages[si];
      const nodes = stage.getLayers()[0].getChildren().filter((n: any) => n.getClassName() !== "Transformer");
      const r = nodes[ni].getClientRect({ skipStroke: true, skipShadow: true });
      const rect = stage.container().getBoundingClientRect();
      return { x: rect.left + r.x, y: rect.top + r.y, width: r.width, height: r.height };
    },
    [stageIndex, nodeIndex] as const,
  );
}

/** Selects the placed piece at `nodeIndex` (layer order) with a click/tap and returns its toolbar. */
export async function selectPiece(page: Page, testInfo: TestInfo, nodeIndex: number): Promise<Locator> {
  // Konva redraws its hit graph on the next animation frame after a piece is
  // added; a click before that misses the piece (and hits the Stage).
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const centre = await nodeScreenCenter(page, nodeIndex);
  if (testInfo.project.use.hasTouch) await page.touchscreen.tap(centre.x, centre.y);
  else await page.mouse.click(centre.x, centre.y);
  const toolbar = selectionPill(page);
  await expect(toolbar).toBeVisible();
  return toolbar;
}

/** Bounding boxes of two locators overlap (with positive area). */
export function boxesOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export async function selectGroup(page: Page, label: "Clothes" | "Shoes" | "Accessories" | "Bags") {
  const button = picker(page).getByRole("group", { name: "Stylebook group" }).getByRole("button", { name: label, exact: true });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

// ---- Save sheet ------------------------------------------------------------

/** The builder's top-bar Save pill (the visible one: phone or desktop header). */
export const saveTrigger = (page: Page) => page.getByRole("button", { name: "Save", exact: true }).filter({ visible: true });
/** The open Save sheet ("Save look" when creating, "Save changes" when editing). */
export const saveSheet = (page: Page) => page.getByRole("dialog", { name: /^Save (look|changes)$/ });
/** The sheet's Name field. */
export const sheetNameInput = (page: Page) => saveSheet(page).getByRole("textbox", { name: "Name", exact: true });
/** An occasion chip in the sheet. */
export const occasionChip = (page: Page, label: string) =>
  saveSheet(page).getByRole("button", { name: label, exact: true });

/** Clicks the top-bar Save and waits for the sheet. */
export async function openSaveSheet(page: Page) {
  await saveTrigger(page).click();
  await expect(saveSheet(page)).toBeVisible();
  return saveSheet(page);
}

/** The id at the end of a `/stylebook/<id>` URL. */
export function lookIdFromUrl(page: Page): string {
  const match = new URL(page.url()).pathname.match(/^\/stylebook\/([^/]+)$/);
  expect(match, `on a look detail page (${page.url()})`).not.toBeNull();
  return match![1];
}

/**
 * Creates the look being built: top-bar Save, optionally types a name (else
 * the auto name is kept), clicks "Save look", and waits for the new look's
 * detail page. Returns the new look's id.
 */
export async function saveNewLook(page: Page, lookName?: string): Promise<string> {
  await openSaveSheet(page);
  if (lookName !== undefined) await sheetNameInput(page).fill(lookName);
  await saveSheet(page).getByRole("button", { name: "Save look", exact: true }).click();
  await expect(page).toHaveURL(/\/stylebook\/(?!create$)[^/]+$/);
  return lookIdFromUrl(page);
}

/** Edit mode: top-bar Save, then "Save changes"; waits for the look's detail page. */
export async function saveLookChanges(page: Page, id: string): Promise<void> {
  await openSaveSheet(page);
  await saveSheet(page).getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/stylebook/${id}$`));
}

const SCREENSHOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../screenshots");

export async function saveScreenshot(page: Page, testInfo: TestInfo, name: string, opts: { fullPage?: boolean; target?: Locator } = {}) {
  const file = path.join(SCREENSHOT_DIR, `${name}-${testInfo.project.name}.png`);
  if (opts.target) await opts.target.screenshot({ path: file });
  else await page.screenshot({ path: file, fullPage: opts.fullPage ?? false });
  await testInfo.attach(name, { path: file, contentType: "image/png" });
  return file;
}

/** Rotated bounding box of a stored placement (rotation about the box centre). */
export function rotatedBox(item: { x: number; y: number; width: number; height: number; rotation: number }) {
  const rad = (item.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const halfW = (item.width * cos + item.height * sin) / 2;
  const halfH = (item.width * sin + item.height * cos) / 2;
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  return { left: cx - halfW, top: cy - halfH, right: cx + halfW, bottom: cy + halfH };
}

/** Every placed piece's on-screen (rotated, stroke-less) bounding box lies
 *  inside the interactive canvas (the panel's visible area), within `tol` px. */
export async function expectPiecesInsideCanvas(page: Page, label: string, tol = 0.5) {
  const { stage, rects } = await nodeClientRects(page);
  expect(rects.length, `${label}: pieces drawn`).toBeGreaterThan(0);
  rects.forEach((r: { x: number; y: number; width: number; height: number }, i: number) => {
    expect(r.x, `${label}: piece ${i} left inside the panel`).toBeGreaterThanOrEqual(-tol);
    expect(r.y, `${label}: piece ${i} top inside the panel`).toBeGreaterThanOrEqual(-tol);
    expect(r.x + r.width, `${label}: piece ${i} right inside the panel`).toBeLessThanOrEqual(stage.width + tol);
    expect(r.y + r.height, `${label}: piece ${i} bottom inside the panel`).toBeLessThanOrEqual(stage.height + tol);
  });
}
