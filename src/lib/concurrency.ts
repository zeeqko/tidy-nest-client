// Generic bounded worker-pool helper (PLAN.md "bulk add items from a
// multi-photo selection" T1). Runs an array of thunks (functions returning a
// Promise) with at most `concurrency` in flight at once. This module knows
// nothing about photos, items, React, or the DOM — both the ingest pass and
// the commit pass of the bulk-add feature reuse it as-is.
//
// Like `itemCutout.ts`, `runPool` must never throw and its returned
// `result` promise must never reject: a task that throws synchronously or
// returns a rejected Promise settles as a `{ ok: false, error }` entry in
// the results array instead of propagating. Callers can therefore always
// await `result` (or drive off `onSettle`) without a try/catch.

export type TaskResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

export interface PoolSettleEvent<T> {
  /** Index of this task in the original `tasks` array (input order). */
  index: number;
  result: TaskResult<T>;
}

export interface RunPoolOptions<T> {
  /** Maximum number of tasks in flight at once. Defaults to 4. */
  concurrency?: number;
  /**
   * Fires once per task, as soon as that task settles (resolves, rejects, or
   * throws) — not once for the whole batch — so a caller can update UI
   * incrementally rather than waiting for every task to finish.
   */
  onSettle?: (event: PoolSettleEvent<T>) => void;
}

export interface PoolHandle<T> {
  /**
   * Resolves once every task that was allowed to start has settled. Always
   * resolves (never rejects, per the module contract above). Entries are in
   * the same order as the input `tasks` array, regardless of completion
   * order. A task that never started because `stop()` was called before its
   * turn is left `undefined` at its index.
   */
  result: Promise<Array<TaskResult<T> | undefined>>;
  /**
   * Stops the pool from *starting* any task that hasn't started yet. Tasks
   * already in flight are left to settle on their own — this does not abort
   * or cancel in-flight work (there is nothing generic to abort a bare
   * Promise with). `result` still resolves once those in-flight tasks
   * settle.
   */
  stop: () => void;
}

/**
 * Runs `tasks` (each a zero-arg function returning a Promise) with at most
 * `options.concurrency` (default 4) running at once, preserving each task's
 * result at its original input index. Zero-length input resolves `result`
 * immediately with an empty array.
 */
export function runPool<T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  options: RunPoolOptions<T> = {},
): PoolHandle<T> {
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 4));
  const onSettle = options.onSettle;
  const results: Array<TaskResult<T> | undefined> = new Array(tasks.length);

  let stopped = false;
  const stop = () => {
    stopped = true;
  };

  if (tasks.length === 0) {
    return { result: Promise.resolve(results), stop };
  }

  let nextIndex = 0;
  let started = 0;
  let completed = 0;

  const result = new Promise<Array<TaskResult<T> | undefined>>((resolve) => {
    const startNext = (): boolean => {
      if (stopped || nextIndex >= tasks.length) return false;
      const index = nextIndex;
      nextIndex += 1;
      started += 1;
      const task = tasks[index];

      // Deferred via Promise.resolve().then(...) so a task that throws
      // synchronously is caught the same way as one that returns a
      // rejected Promise — both land in the .then(onFulfilled, onRejected)
      // below rather than throwing out of this function.
      Promise.resolve()
        .then(() => task())
        .then(
          (value) => {
            results[index] = { ok: true, value };
          },
          (error) => {
            results[index] = { ok: false, error };
          },
        )
        .then(() => {
          completed += 1;
          // Invariant, not a live branch: the .then(onFulfilled, onRejected)
          // above unconditionally sets results[index] before this callback
          // runs, so `settled` is always defined here.
          const settled = results[index]!;
          try {
            onSettle?.({ index, result: settled });
          } catch {
            // A throwing progress callback must not be able to stall the
            // pool — skipping startNext()/resolve() below would break the
            // never-stalls contract for every task after (or including)
            // this one.
          }

          if (!startNext() && completed === started) {
            resolve(results);
          }
        });

      return true;
    };

    const initial = Math.min(concurrency, tasks.length);
    for (let i = 0; i < initial; i += 1) {
      startNext();
    }
  });

  return { result, stop };
}
