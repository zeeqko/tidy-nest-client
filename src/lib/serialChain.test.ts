import { describe, expect, it } from "vitest";
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

  it("keeps running later tasks after one throws or rejects", async () => {
    const chain = createSerialChain();
    const order: string[] = [];
    void chain.run(() => {
      throw new Error("boom");
    });
    void chain.run(() => Promise.reject(new Error("nope")));
    await chain.run(() => {
      order.push("after");
    });
    expect(order).toEqual(["after"]);
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
