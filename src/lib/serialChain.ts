/**
 * Runs tasks strictly one after another in submission order. A task that
 * throws or rejects does not stop later tasks. Used by the builder so the
 * async part of adding an item (waiting for its image aspect) can never
 * reorder or drop rapid successive adds.
 */
export interface SerialChain {
  run(task: () => void | Promise<void>): Promise<void>;
}

export function createSerialChain(): SerialChain {
  let tail: Promise<void> = Promise.resolve();
  return {
    run(task) {
      const next = tail.then(task).catch(() => {});
      tail = next;
      return next;
    },
  };
}
