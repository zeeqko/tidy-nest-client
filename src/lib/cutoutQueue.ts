// Bounded-concurrency queue that generates cutouts for inventory items in the
// background. Each id runs at most once per queue lifetime (a failure is not
// retried in the same session). Subscribers hear about successful cutouts only.
import type { CutoutResult } from "./itemCutout";

export interface CutoutQueue {
  enqueue(item: { id: string; imageURL?: string; cutoutURL?: string }): void;
  subscribe(listener: (itemId: string, cutoutURL: string) => void): () => void;
}

type Run = (itemId: string, imageURL: string) => Promise<CutoutResult>;

// Lazy import keeps the browser/ML modules out of non-browser environments
// (e.g. unit tests) until a real run is actually needed.
const defaultRun: Run = async (itemId, imageURL) => {
  const { generateItemCutout } = await import("./itemCutout");
  return generateItemCutout(itemId, imageURL);
};

export function createCutoutQueue(run: Run = defaultRun, concurrency = 2): CutoutQueue {
  const seen = new Set<string>();
  const pending: { id: string; imageURL: string }[] = [];
  const listeners = new Set<(itemId: string, cutoutURL: string) => void>();
  let active = 0;

  function notify(id: string, url: string) {
    for (const l of [...listeners]) {
      try {
        l(id, url);
      } catch {
        // a bad listener must not affect others or the queue
      }
    }
  }

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
        if (result && result.ok) notify(job.id, result.cutoutURL);
        pump();
      });
    }
  }

  return {
    enqueue(item) {
      if (item.cutoutURL || !item.imageURL || seen.has(item.id)) return;
      seen.add(item.id);
      pending.push({ id: item.id, imageURL: item.imageURL });
      pump();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
