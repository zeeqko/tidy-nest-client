import { describe, it, expect, vi } from "vitest";
import { createCutoutQueue } from "./cutoutQueue";
import type { CutoutResult } from "./itemCutout";

type Deferred = {
  id: string;
  resolve: (r: CutoutResult) => void;
  reject: (e: unknown) => void;
};

function makeRun() {
  const calls: Deferred[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const run = vi.fn((id: string, _url: string) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    return new Promise<CutoutResult>((resolve, reject) => {
      calls.push({
        id,
        resolve: (r) => {
          inFlight--;
          resolve(r);
        },
        reject: (e) => {
          inFlight--;
          reject(e);
        },
      });
    });
  });
  return { run, calls, maxInFlight: () => maxInFlight };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const ok = (url: string): CutoutResult => ({ ok: true, cutoutURL: url, persisted: true });

describe("cutoutQueue", () => {
  it("never runs more than concurrency at once and starts pending FIFO", async () => {
    const { run, calls, maxInFlight } = makeRun();
    const q = createCutoutQueue(run, 2);
    for (const id of ["a", "b", "c", "d"]) q.enqueue({ id, imageURL: `/${id}` });
    expect(run).toHaveBeenCalledTimes(2);
    expect(calls.map((c) => c.id)).toEqual(["a", "b"]);
    q.enqueue({ id: "e", imageURL: "/e" });
    expect(run).toHaveBeenCalledTimes(2);
    calls[0].resolve(ok("u"));
    await flush();
    expect(calls.map((c) => c.id)).toEqual(["a", "b", "c"]);
    calls[1].resolve({ ok: false });
    await flush();
    expect(calls.map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
    calls[2].resolve(ok("u"));
    calls[3].resolve(ok("u"));
    await flush();
    expect(calls.map((c) => c.id)).toEqual(["a", "b", "c", "d", "e"]);
    calls[4].resolve(ok("u"));
    await flush();
    expect(maxInFlight()).toBe(2);
  });

  it("dedupes the same id, including while pending and after completion", async () => {
    const { run, calls } = makeRun();
    const q = createCutoutQueue(run, 1);
    q.enqueue({ id: "a", imageURL: "/a" });
    q.enqueue({ id: "b", imageURL: "/b" });
    q.enqueue({ id: "b", imageURL: "/b" });
    q.enqueue({ id: "a", imageURL: "/a" });
    calls[0].resolve(ok("u"));
    await flush();
    calls[1].resolve(ok("u"));
    await flush();
    q.enqueue({ id: "a", imageURL: "/a" });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("ignores items with a cutoutURL or without an imageURL", () => {
    const { run } = makeRun();
    const q = createCutoutQueue(run);
    q.enqueue({ id: "a", imageURL: "/a", cutoutURL: "/c" });
    q.enqueue({ id: "b" });
    q.enqueue({ id: "c", imageURL: "" });
    expect(run).not.toHaveBeenCalled();
  });

  it("does not retry a failed id", async () => {
    const { run, calls } = makeRun();
    const q = createCutoutQueue(run);
    q.enqueue({ id: "a", imageURL: "/a" });
    calls[0].resolve({ ok: false });
    await flush();
    q.enqueue({ id: "a", imageURL: "/a" });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("treats a rejecting or throwing run as failure without stalling", async () => {
    const seen: string[] = [];
    const run = vi.fn((id: string): Promise<CutoutResult> => {
      seen.push(id);
      if (id === "a") return Promise.reject(new Error("boom"));
      if (id === "b") throw new Error("sync boom");
      return Promise.resolve(ok("u"));
    });
    const q = createCutoutQueue(run, 1);
    const listener = vi.fn();
    q.subscribe(listener);
    q.enqueue({ id: "a", imageURL: "/a" });
    q.enqueue({ id: "b", imageURL: "/b" });
    q.enqueue({ id: "c", imageURL: "/c" });
    await flush();
    await flush();
    expect(seen).toEqual(["a", "b", "c"]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("c", "u");
  });

  it("notifies subscribers on success only, and unsubscribe works", async () => {
    const { run, calls } = makeRun();
    const q = createCutoutQueue(run);
    const l1 = vi.fn();
    const l2 = vi.fn();
    const off1 = q.subscribe(l1);
    q.subscribe(l2);
    q.enqueue({ id: "a", imageURL: "/a" });
    q.enqueue({ id: "b", imageURL: "/b" });
    calls[0].resolve({ ok: false });
    await flush();
    expect(l1).not.toHaveBeenCalled();
    off1();
    calls[1].resolve(ok("/cut-b"));
    await flush();
    expect(l1).not.toHaveBeenCalled();
    expect(l2).toHaveBeenCalledWith("b", "/cut-b");
  });

  it("a throwing listener does not break other listeners or the queue", async () => {
    const { run, calls } = makeRun();
    const q = createCutoutQueue(run, 1);
    const good = vi.fn();
    q.subscribe(() => {
      throw new Error("bad listener");
    });
    q.subscribe(good);
    q.enqueue({ id: "a", imageURL: "/a" });
    q.enqueue({ id: "b", imageURL: "/b" });
    calls[0].resolve(ok("/x"));
    await flush();
    expect(good).toHaveBeenCalledWith("a", "/x");
    expect(run).toHaveBeenCalledTimes(2);
  });
});
