// Test-only stand-in for the background-removal Web Worker.
//
// The real worker (src/lib/backgroundRemoval.worker.ts) downloads a multi-MB
// ML model from a CDN, which the hermetic e2e browser blocks (every
// cross-origin request is aborted, see fixtures.ts). `installFakeCutoutWorker`
// replaces `window.Worker` before any app code runs: constructing the
// background-removal worker returns a fake whose `postMessage` answers like
// the real one — `{ ok: true, blob }` with a small PNG drawn on an
// OffscreenCanvas, or `{ ok: false, error }` — while any other worker is
// created normally. Everything else in the cutout pipeline is real: the photo
// fetch, the downscale, the upload to /api/uploads and the persist PUT onto
// the inventory item. No product code is changed for this.
//
// With `hold: true` answers wait until `releaseFakeCutouts(page)`, so a test
// can observe the in-progress state deterministically.
import { expect, type Page } from "@playwright/test";

export interface FakeCutoutOptions {
  mode: "ok" | "fail";
  hold: boolean;
}

interface FakeControl {
  requests: number;
  hold: boolean;
  held: (() => void)[];
}

export async function installFakeCutoutWorker(page: Page, options: FakeCutoutOptions) {
  await page.addInitScript(({ mode, hold }: FakeCutoutOptions) => {
    const RealWorker = window.Worker;
    const control: FakeControl = { requests: 0, hold, held: [] };
    (window as unknown as { __fakeCutout: FakeControl }).__fakeCutout = control;

    class FakeRemovalWorker {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      private terminated = false;
      postMessage() {
        control.requests += 1;
        const answer = async () => {
          let data: unknown;
          if (mode === "ok") {
            // Same 60x90 aspect as the seeded photo; a distinct green.
            const canvas = new OffscreenCanvas(60, 90);
            const ctx = canvas.getContext("2d")!;
            ctx.fillStyle = "rgb(40, 160, 90)";
            ctx.fillRect(6, 6, 48, 78);
            data = { ok: true, blob: await canvas.convertToBlob({ type: "image/png" }) };
          } else {
            data = { ok: false, error: "fake background removal failure" };
          }
          if (!this.terminated) this.onmessage?.({ data });
        };
        if (control.hold) control.held.push(() => void answer());
        else void answer();
      }
      terminate() {
        this.terminated = true;
      }
      addEventListener() {}
      removeEventListener() {}
    }

    const PatchedWorker = function (this: unknown, url: string | URL, opts?: WorkerOptions) {
      if (String(url).includes("backgroundRemoval.worker")) return new FakeRemovalWorker();
      return new RealWorker(url, opts);
    } as unknown as typeof Worker;
    window.Worker = PatchedWorker;
  }, options);
}

/** Waits until the app asked the fake worker for at least `count` cutouts,
 *  then answers every held request (and any later one immediately). */
export async function releaseFakeCutouts(page: Page, count = 1) {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __fakeCutout: FakeControl }).__fakeCutout.requests))
    .toBeGreaterThanOrEqual(count);
  await page.evaluate(() => {
    const control = (window as unknown as { __fakeCutout: FakeControl }).__fakeCutout;
    control.hold = false;
    for (const answer of control.held.splice(0)) answer();
  });
}

/** Requests the fake worker has received so far. */
export function fakeCutoutRequests(page: Page) {
  return page.evaluate(() => (window as unknown as { __fakeCutout: FakeControl }).__fakeCutout.requests);
}
