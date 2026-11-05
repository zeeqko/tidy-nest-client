import { describe, expect, it, vi } from "vitest";
import { createSerialChain } from "./serialChain";

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe("createSerialChain", () => {
  it("finishes tasks in submission order even when an earlier one is slower", async () => {
    const chain = createSerialChain();
    const order: string[] = [];
    const slow = deferred();
    const first = chain.run(async () => {
      await slow.promise;
      order.push("first");
    });
    const second = chain.run(() => {
      order.push("second");
    });
    await Promise.resolve();
    expect(order).toEqual([]);
    slow.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["first", "second"]);
  });

  it("keeps running later tasks after one throws or rejects, warning about each failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const chain = createSerialChain();
      const order: string[] = [];
      const boom = new Error("boom");
      const nope = new Error("nope");
      void chain.run(() => {
        throw boom;
      });
      void chain.run(() => Promise.reject(nope));
      await chain.run(() => {
        order.push("after");
      });
      expect(order).toEqual(["after"]);
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn.mock.calls.map((c) => c[1])).toEqual([boom, nope]);
    } finally {
      warn.mockRestore();
    }
  });

  it("runs the same task twice when submitted twice", async () => {
    const chain = createSerialChain();
    let count = 0;
    const task = () => {
      count++;
    };
    void chain.run(task);
    await chain.run(task);
    expect(count).toBe(2);
  });
});
