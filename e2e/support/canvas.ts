// Helpers for reading and driving the Konva canvas and the picker.
//
// Konva registers itself as `window.Konva` and tracks every live Stage in
// `Konva.stages`, which lets tests read each placed node's logical transform
// (the Stage is scaled, so node attributes are in the 400x711 design space)
// without adding test hooks to product code. A placed node's Konva x/y is
// its box centre (offset = half size, see OutfitCanvas PlacedNode), so the
// stored top-left is x - offsetX. In the interactive builder the layer's
// first child is the white "board" Rect (the framed 400x711 area); it is not
// a placed piece, so every helper below skips it along with the Transformer.
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
}

export interface Point {
  x: number;
  y: number;
}

export const DESIGN_WIDTH = 400;
export const DESIGN_HEIGHT = 711;

/** Logical rect + on-screen client rect of the builder's board, or null when the stage has none (read-only canvases). */
export async function boardInfo(page: Page, stageIndex = 0) {
  return page.evaluate((index) => {
    const stage = (window as any).Konva?.stages?.[index];
    const board = stage?.findOne(".board");
    if (!board) return null;
    return {
      x: board.x(),
      y: board.y(),
      width: board.width(),
      height: board.height(),
      fill: board.fill(),
      listening: board.listening(),
      zIndex: board.zIndex(),
      client: board.getClientRect({ skipStroke: true }),
      stage: { width: stage.width(), height: stage.height() },
    };
  }, stageIndex);
}

/** Placed nodes of the stage at `stageIndex`, in layer (z) order. */
export async function canvasNodes(page: Page, stageIndex = 0): Promise<CanvasNode[]> {
  return page.evaluate((index) => {
    const Konva = (window as any).Konva;
    const stage = Konva?.stages?.[index];
    if (!stage) return [];
    const layer = stage.getLayers()[0];
    return layer.getChildren().filter((n: any) => n.getClassName() !== "Transformer" && !n.hasName("board")).map((n: any) => ({
      cls: n.getClassName(),
      x: n.x() - n.offsetX(),
      y: n.y() - n.offsetY(),
      width: n.width(),
      height: n.height(),
      rotation: n.rotation(),
      fill: typeof n.fill === "function" ? (n.fill() ?? null) : null,
      hasImage: typeof n.image === "function" ? Boolean(n.image()) : false,
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
        const nodes = stage.getLayers()[0].getChildren().filter((n: any) => n.getClassName() !== "Transformer" && !n.hasName("board"));
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

/** Each placed node's on-screen (stage-relative, scaled) client rect plus the stage size. */
export async function nodeClientRects(page: Page, stageIndex = 0) {
  return page.evaluate((index) => {
    const stage = (window as any).Konva.stages[index];
    const nodes = stage.getLayers()[0].getChildren().filter((n: any) => n.getClassName() !== "Transformer" && !n.hasName("board"));
    const container = stage.container().getBoundingClientRect();
    return {
      stage: { width: stage.width(), height: stage.height() },
      container: { x: container.left, y: container.top, width: container.width, height: container.height },
        rects: nodes.map((n: any) => n.getClientRect({ skipStroke: true, skipShadow: true })),
    };
  }, stageIndex);
}

/**
 * A viewport point over empty canvas: inside the 400x711 design area (the
 * board) and at least `margin` px away from every placed node.
 */
export async function emptyCanvasPoint(page: Page, margin = 40): Promise<Point> {
  const point = await page.evaluate((m) => {
    const stage = (window as any).Konva.stages[0];
    const rect = stage.container().getBoundingClientRect();
    const top = rect.top + stage.y();
    const bottomLimit = Math.min(rect.bottom, top + 711 * stage.scaleY()) - m;
    const nodes = stage.getLayers()[0].getChildren().filter((n: any) => n.getClassName() !== "Transformer" && !n.hasName("board"));
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

/** The interactive canvas container (the ✕ and the pill are overlaid in it). */
export const outfitCanvas = (page: Page) => page.getByTestId("outfit-canvas");
/** The selected piece's red remove ✕ (scoped to the canvas: the picker's
 *  count badges are also named "Remove last …"). */
export const removeCross = (page: Page) => outfitCanvas(page).getByRole("button", { name: /^Remove / });
/** The selection pill (send to back / bring to front / copy). */
export const selectionPill = (page: Page) => outfitCanvas(page).getByRole("toolbar", { name: /actions$/ });

/** Viewport rect of the placed node at `nodeIndex` (layer order): its rotated, axis-aligned bounding box, stroke excluded. */
export async function nodeScreenRect(page: Page, nodeIndex: number, stageIndex = 0) {
  return page.evaluate(
    ([si, ni]) => {
      const stage = (window as any).Konva.stages[si];
      const nodes = stage.getLayers()[0].getChildren().filter((n: any) => n.getClassName() !== "Transformer" && !n.hasName("board"));
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

/** Names the look and saves it, returning the saved look's id. */
export async function saveNewLook(page: Page, lookName: string): Promise<void> {
  await page.getByPlaceholder("Name your look").fill(lookName);
  await page.getByRole("button", { name: "Save to Style Book" }).click();
  await expect(page).toHaveURL(/\/stylebook$/);
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
