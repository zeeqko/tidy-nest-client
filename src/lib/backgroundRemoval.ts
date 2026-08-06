// Client-side background removal for inventory item photos (see PLAN.md T5).
// This is the only module that touches `@imgly/background-removal` (via
// `./backgroundRemoval.worker.ts`) — keep it that way so the (multi-MB,
// WASM/ONNX-backed) library and its model assets stay behind the dynamic
// import in the worker and never land in the app's initial bundle. Only a
// user who attaches a photo pays that cost, and only when they do.
//
// The actual library call runs in a dedicated Worker
// (`backgroundRemoval.worker.ts`), not on the main thread. Without COOP/COEP
// headers (forbidden by PLAN.md T5 open question 1), the browser can't do
// multi-threaded WASM, and
// `env.wasm.numThreads` silently falls back to single-threaded — which the
// library then runs *synchronously* wherever it's called from. Calling it on
// the main thread would freeze the tab for the full duration (tens of
// seconds) and would also stop the `setTimeout` backing `timeoutMs` from ever
// firing, since a blocked main thread can't run the event loop. Running it in
// a worker instead keeps the UI responsive and lets the timeout below
// actually race against something: on timeout we simply terminate the
// worker, which is safe precisely because it never touched the main thread.
import type { WorkerRequest, WorkerResponse } from "./backgroundRemoval.worker";

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Runs background removal on `source` and returns a PNG `Blob` with a
 * transparent background, or `null` on any failure (model fetch blocked,
 * offline, decode error, or simply taking longer than `timeoutMs`).
 *
 * Never throws and never hangs forever — callers can treat a `null` result as
 * "no cutout this time" and fall back to saving with the original photo only.
 * Runs off the main thread (see module comment above), so the UI stays
 * interactive while this is in flight.
 */
export async function removeBackground(
  source: File | Blob,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Blob | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let worker: Worker | undefined;
  try {
    worker = new Worker(new URL("./backgroundRemoval.worker.ts", import.meta.url), {
      type: "module",
    });
    const activeWorker = worker;
    const result = await Promise.race([
      new Promise<Blob>((resolve, reject) => {
        activeWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          if (event.data.ok) resolve(event.data.blob);
          else reject(new Error(event.data.error));
        };
        activeWorker.onerror = (event) => {
          reject(new Error(event.message || "background removal worker failed"));
        };
        const request: WorkerRequest = { source };
        activeWorker.postMessage(request);
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("background removal timed out")), timeoutMs);
      }),
    ]);
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    // Abandon the worker on timeout/error rather than waiting for it — safe
    // because it was never on the main thread to begin with.
    worker?.terminate();
  }
}
