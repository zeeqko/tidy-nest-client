// Dedicated Web Worker that runs the actual `@imgly/background-removal`
// call — see the comment in `backgroundRemoval.ts` for why this exists: the
// library's own `proxyToWorker` config option only takes effect on its
// WebGPU device path in this version, so on the plain CPU/WASM path this app
// runs (no COOP/COEP headers, no GPU requirement — PLAN.md T5 open question
// 1), inference runs synchronously wherever it's invoked. Invoking it here,
// inside a worker we own, keeps that synchronous work off the main thread
// unconditionally, in every browser, without WebGPU or cross-origin
// isolation.
//
// This file intentionally has no other exports/imports at runtime (the
// `WorkerRequest`/`WorkerResponse` types below are erased — see
// `verbatimModuleSyntax` in tsconfig) so it stays a clean, single-purpose
// worker entry point for Vite's worker bundling.

// Minimal local typings for the worker global scope so this file doesn't
// need the "webworker" TS lib (which would collide with the "DOM" lib the
// rest of the app's single tsconfig already includes).
interface WorkerGlobalScopeLike {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
}

export interface WorkerRequest {
  source: File | Blob;
}

export type WorkerResponse = { ok: true; blob: Blob } | { ok: false; error: string };

declare const self: WorkerGlobalScopeLike;

self.onmessage = (event) => {
  void (async () => {
    try {
      const { removeBackground: run } = await import("@imgly/background-removal");
      const blob = await run(event.data.source, { output: { format: "image/png" } });
      self.postMessage({ ok: true, blob });
    } catch (err) {
      self.postMessage({
        ok: false,
        error: err instanceof Error ? err.message : "background removal failed",
      });
    }
  })();
};
