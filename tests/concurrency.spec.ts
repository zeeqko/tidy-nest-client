import { test, expect } from "@playwright/test";

/**
 * T1 (client/src/lib/concurrency.ts) unit coverage.
 *
 * Per PLAN.md's "bulk add items from a multi-photo selection" shared
 * testing notes: concurrency.ts is a pure, framework-free module with no
 * DOM/React/network dependency, so it is exercised through the Vite dev
 * server rather than a dedicated unit-test runner — `page.goto('/')`, then
 * `page.evaluate` a dynamic `import('/src/lib/concurrency.ts')` and run all
 * assertions *inside* the evaluate, returning only plain serializable data
 * (a module namespace object cannot cross the page/Node boundary).
 *
 * This technique was validated manually before writing this file (see the
 * test-writer report) and was not flaky in repeated runs, so no fallback
 * was needed.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("concurrency cap of 4 with 12 varied-duration tasks: peak concurrency, all settle, order preserved", async ({
  page,
}) => {
  const outcome = await page.evaluate(async () => {
    const mod = await import("/src/lib/concurrency.ts");

    const DURATIONS = [50, 10, 30, 5, 40, 15, 25, 35, 5, 45, 20, 10];
    let active = 0;
    let peak = 0;

    const tasks = DURATIONS.map((ms, i) => async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, ms));
      active -= 1;
      return `value-${i}`;
    });

    const settleIndexOrder: number[] = [];
    const handle = mod.runPool(tasks, {
      concurrency: 4,
      onSettle: (event: { index: number }) => {
        settleIndexOrder.push(event.index);
      },
    });

    const results = await handle.result;

    return {
      peak,
      length: results.length,
      allOk: results.every((r: { ok: boolean } | undefined) => r?.ok === true),
      values: results.map((r: { ok: boolean; value: unknown }) => (r?.ok ? r.value : null)),
      settleIndexOrder,
      settleCount: settleIndexOrder.length,
      // Completion order should NOT simply be 0..11 given the varied
      // durations above (shorter tasks scheduled later can finish before
      // longer ones scheduled earlier), proving results are placed by
      // input index rather than by completion order.
      completionOrderIsInputOrder: settleIndexOrder.every((v, i) => v === i),
    };
  });

  expect(outcome.peak).toBe(4);
  expect(outcome.length).toBe(12);
  expect(outcome.allOk).toBe(true);
  expect(outcome.values).toEqual(Array.from({ length: 12 }, (_, i) => `value-${i}`));
  expect(outcome.settleCount).toBe(12);
  // Completion (settle) order is driven by duration, not input order — this
  // is the whole point of the ordering guarantee living in the `results`
  // array (indexed by input position) rather than in onSettle firing order.
  expect(outcome.completionOrderIsInputOrder).toBe(false);
  // But every index 0..11 settled exactly once regardless of order.
  expect([...outcome.settleIndexOrder].sort((a, b) => a - b)).toEqual(
    Array.from({ length: 12 }, (_, i) => i),
  );
});

test("a throwing task and a rejecting task both produce failure entries without the pool rejecting or stalling", async ({
  page,
}) => {
  const outcome = await page.evaluate(async () => {
    const mod = await import("/src/lib/concurrency.ts");

    const tasks: Array<() => Promise<string>> = [
      async () => "ok-0",
      () => {
        throw new Error("sync-throw");
      },
      async () => {
        throw new Error("async-throw-after-await");
      },
      async () => Promise.reject(new Error("explicit-reject")),
      async () => "ok-4",
    ];

    let rejected = false;
    let results: unknown;
    try {
      const handle = mod.runPool(tasks, { concurrency: 4 });
      results = await handle.result;
    } catch {
      rejected = true;
    }

    return { rejected, results };
  });

  expect(outcome.rejected).toBe(false);
  const results = outcome.results as Array<{ ok: boolean; value?: unknown; error?: unknown } | undefined>;
  expect(results).toHaveLength(5);
  expect(results[0]).toMatchObject({ ok: true, value: "ok-0" });
  expect(results[1]?.ok).toBe(false);
  expect(results[2]?.ok).toBe(false);
  expect(results[3]?.ok).toBe(false);
  expect(results[4]).toMatchObject({ ok: true, value: "ok-4" });
});

test("per-settle progress callback fires exactly once per task (12 tasks -> 12 calls)", async ({ page }) => {
  const settleCount = await page.evaluate(async () => {
    const mod = await import("/src/lib/concurrency.ts");
    const tasks = Array.from({ length: 12 }, (_, i) => async () => {
      await new Promise((resolve) => setTimeout(resolve, (i % 3) * 5));
      return i;
    });
    let count = 0;
    const handle = mod.runPool(tasks, {
      concurrency: 4,
      onSettle: () => {
        count += 1;
      },
    });
    await handle.result;
    return count;
  });

  expect(settleCount).toBe(12);
});

test("stop() halts further scheduling: no new task starts after stop, already-started tasks still settle correctly", async ({
  page,
}) => {
  const outcome = await page.evaluate(async () => {
    const mod = await import("/src/lib/concurrency.ts");

    const started: number[] = [];
    const TASK_COUNT = 10;
    const tasks = Array.from({ length: TASK_COUNT }, (_, i) => async () => {
      started.push(i);
      await new Promise((resolve) => setTimeout(resolve, 40));
      return `done-${i}`;
    });

    const handle = mod.runPool(tasks, { concurrency: 4 });

    // Let the first wave (up to `concurrency`) start, then stop before any
    // of them has had time to settle and trigger scheduling of the next
    // wave.
    await new Promise((resolve) => setTimeout(resolve, 10));
    const startedCountAtStop = started.length;
    handle.stop();

    const results = await handle.result;

    return {
      startedCountAtStop,
      finalStartedCount: started.length,
      results: results.map((r) => (r === undefined ? undefined : { ok: r.ok, value: r.ok ? r.value : null })),
    };
  });

  // Exactly `concurrency` (4) tasks should have started before stop() was
  // called (10ms is well under the 40ms task duration, so none had settled
  // yet to trigger scheduling of a 5th).
  expect(outcome.startedCountAtStop).toBe(4);
  // No additional task started after stop(), even though 6 remained unscheduled.
  expect(outcome.finalStartedCount).toBe(4);

  // The 4 tasks that did start settle correctly (ok:true with their value).
  for (let i = 0; i < 4; i += 1) {
    expect(outcome.results[i]).toEqual({ ok: true, value: `done-${i}` });
  }
  // The remaining 6 never started, so their slot stays undefined.
  for (let i = 4; i < 10; i += 1) {
    expect(outcome.results[i]).toBeUndefined();
  }
});

test("zero-length input resolves result immediately with an empty array", async ({ page }) => {
  const outcome = await page.evaluate(async () => {
    const mod = await import("/src/lib/concurrency.ts");
    const start = performance.now();
    const handle = mod.runPool([], { concurrency: 4 });
    const results = await handle.result;
    const elapsed = performance.now() - start;
    return { length: results.length, elapsed };
  });

  expect(outcome.length).toBe(0);
  // "Immediately" — generous bound to absorb CI/test jitter, well under any
  // task-duration timer used elsewhere in this file.
  expect(outcome.elapsed).toBeLessThan(50);
});

test("regression: a throwing onSettle callback does not stall the pool or skip scheduling of remaining tasks", async ({
  page,
}) => {
  const outcome = await page.evaluate(async () => {
    const mod = await import("/src/lib/concurrency.ts");

    const TASK_COUNT = 8;
    const tasks = Array.from({ length: TASK_COUNT }, (_, i) => async () => {
      await new Promise((resolve) => setTimeout(resolve, 5 + i));
      return i;
    });

    let onSettleCalls = 0;
    let rejected = false;
    let results: unknown;
    try {
      const handle = mod.runPool(tasks, {
        concurrency: 4,
        onSettle: () => {
          onSettleCalls += 1;
          // Every single onSettle call throws — the pool must still
          // schedule remaining tasks and resolve `result`.
          throw new Error("boom from onSettle");
        },
      });
      results = await handle.result;
    } catch {
      rejected = true;
    }

    return { rejected, onSettleCalls, results };
  });

  expect(outcome.rejected).toBe(false);
  expect(outcome.onSettleCalls).toBe(8);
  const results = outcome.results as Array<{ ok: boolean; value: unknown } | undefined>;
  expect(results).toHaveLength(8);
  expect(results.every((r) => r?.ok === true)).toBe(true);
  expect(results.map((r) => r?.value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
});

test("regression: a fractional concurrency (2.9) behaves as its floored integer (2)", async ({ page }) => {
  const outcome = await page.evaluate(async () => {
    const mod = await import("/src/lib/concurrency.ts");

    let active = 0;
    let peak = 0;
    const TASK_COUNT = 8;
    const tasks = Array.from({ length: TASK_COUNT }, () => async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return true;
    });

    const handle = mod.runPool(tasks, { concurrency: 2.9 });
    const results = await handle.result;

    return { peak, length: results.length, allOk: results.every((r) => r?.ok === true) };
  });

  expect(outcome.peak).toBe(2);
  expect(outcome.length).toBe(8);
  expect(outcome.allOk).toBe(true);
});
