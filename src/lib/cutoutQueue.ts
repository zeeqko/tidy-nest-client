// Bounded-concurrency queue that generates cutouts for inventory items in the
// background. Each id runs at most once per queue lifetime (a failure is not
// retried in the same session). `subscribe` listeners hear about successful
// cutouts only; `subscribeStatus` listeners hear every id's lifecycle
// ('pending' when it is accepted, then exactly one of 'done' / 'failed').
import type { CutoutResult } from "./itemCutout";

export type CutoutStatus = "pending" | "done" | "failed";

export interface CutoutStatusEvent {
  itemId: string;
  status: CutoutStatus;
}

export interface CutoutQueue {
  enqueue(item: { id: string; imageURL?: string; cutoutURL?: string }): void;
  subscribe(listener: (itemId: string, cutoutURL: string) => void): () => void;
  /** Progress of every accepted id: 'pending' as soon as it is queued (or
   *  started), then 'done' (after the `subscribe` listeners got the URL) or
   *  'failed' (`{ ok: false }`, a rejection or a throwing run). Ids the queue
   *  ignores (deduped, already cut out, no photo) emit nothing. */
  subscribeStatus(listener: (event: CutoutStatusEvent) => void): () => void;
}

type Run = (itemId: string, imageURL: string) => Promise<CutoutResult>;

// Lazy import keeps the browser/ML modules out of non-browser environments
// (e.g. unit tests) until a real run is actually needed.
const defaultRun: Run = async (itemId, imageURL) => {
  const { generateItemCutout } = await import("./itemCutout");
  return generateItemCutout(itemId, imageURL);
};

/** Calls every listener with `args`; a throwing listener must not affect the
 *  others or the queue. */
function emit<A extends unknown[]>(listeners: Set<(...args: A) => void>, ...args: A) {
  for (const l of [...listeners]) {
    try {
      l(...args);
    } catch {
      // ignored on purpose
    }
  }
}

export function createCutoutQueue(run: Run = defaultRun, concurrency = 2): CutoutQueue {
  const seen = new Set<string>();
  const pending: { id: string; imageURL: string }[] = [];
  const listeners = new Set<(itemId: string, cutoutURL: string) => void>();
  const statusListeners = new Set<(event: CutoutStatusEvent) => void>();
  let active = 0;

  function pump() {
    while (active < concurrency && pending.length > 0) {
      const job = pending.shift()!;
      active++;
      let p: Promise<CutoutResult>;
      try {
        p = Promise.resolve(run(job.id, job.imageURL));
      } catch {
        p = Promise.resolve({ ok: false });
      }
      p.catch((): CutoutResult => ({ ok: false })).then((result) => {
        active--;
        if (result && result.ok) {
          emit(listeners, job.id, result.cutoutURL);
          emit(statusListeners, { itemId: job.id, status: "done" });
        } else {
          emit(statusListeners, { itemId: job.id, status: "failed" });
        }
        pump();
      });
    }
  }

  return {
    enqueue(item) {
      if (item.cutoutURL || !item.imageURL || seen.has(item.id)) return;
      seen.add(item.id);
      pending.push({ id: item.id, imageURL: item.imageURL });
      emit(statusListeners, { itemId: item.id, status: "pending" });
      pump();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    subscribeStatus(listener) {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },
  };
}
