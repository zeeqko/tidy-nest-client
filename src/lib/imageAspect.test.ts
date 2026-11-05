import { afterEach, describe, expect, it, vi } from "vitest";
import { loadImageAspect } from "./imageAspect";

afterEach(() => {
  vi.useRealTimers();
});

describe("loadImageAspect", () => {
  it("resolves 1 without calling the loader when there is no source", async () => {
    const load = vi.fn();
    await expect(loadImageAspect(undefined, { load })).resolves.toBe(1);
    await expect(loadImageAspect("", { load })).resolves.toBe(1);
    expect(load).not.toHaveBeenCalled();
  });

  it("resolves width / height of the loaded image", async () => {
    const load = vi.fn(async () => ({ width: 300, height: 600 }));
    await expect(loadImageAspect("/a.png", { load })).resolves.toBe(0.5);
    expect(load).toHaveBeenCalledWith("/a.png");
  });

  it("resolves 1 when the loader rejects or throws", async () => {
    await expect(
      loadImageAspect("/a.png", { load: () => Promise.reject(new Error("nope")) }),
    ).resolves.toBe(1);
    await expect(
      loadImageAspect("/a.png", {
        load: () => {
          throw new Error("sync");
        },
      }),
    ).resolves.toBe(1);
  });

  it("resolves 1 for a zero-sized image", async () => {
    await expect(
      loadImageAspect("/a.png", { load: async () => ({ width: 0, height: 0 }) }),
    ).resolves.toBe(1);
    await expect(
      loadImageAspect("/a.png", { load: async () => ({ width: 10, height: 0 }) }),
    ).resolves.toBe(1);
  });

  it("resolves 1 after the timeout when the image never loads, ignoring a late load", async () => {
    vi.useFakeTimers();
    let resolveLoad: (size: { width: number; height: number }) => void = () => {};
    const load = () => new Promise<{ width: number; height: number }>((r) => (resolveLoad = r));
    const result = loadImageAspect("/slow.png", { load, timeoutMs: 1500 });
    await vi.advanceTimersByTimeAsync(1499);
    let settled = false;
    void result.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe(1);
    resolveLoad({ width: 200, height: 100 });
    await expect(result).resolves.toBe(1);
  });
});
