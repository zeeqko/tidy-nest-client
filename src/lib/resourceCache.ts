// Module-level cache for list resources (categories, items, looks) shared by
// every component that mounts the same hook (PLAN.md "Perf: zero-cost
// caching" T19). Each resource keeps one immutable snapshot and exposes it
// through `useSyncExternalStore`; the snapshot object is replaced only when
// something changes, so `getSnapshot` is reference-stable between updates
// (an unstable snapshot would loop forever).
//
// Semantics: every mount revalidates but joins a request already in flight;
// `refresh()` always starts a new request and only the latest-started one is
// saved. A generation counter enforces this, and `reset()` bumps it too so a
// request started before the reset (e.g. by the previous user) never writes.
// `refresh()` never rejects.

import { useCallback, useEffect, useSyncExternalStore } from "react";

export interface ResourceState<T> {
  data: T;
  /** True only until the first fetch settles after creation or `reset()`. */
  loading: boolean;
  error: string | null;
}

export interface ResetOptions {
  /** Refetch for mounted consumers after clearing (default true). Pass false
   *  on logout, where the refetch would only 401. */
  refetch?: boolean;
}

export interface Resource<T> {
  useResource: () => ResourceState<T>;
  /** Starts a new request; resolves after the store updates. Never rejects. */
  refresh: () => Promise<void>;
  /** Restores the empty, loading state and discards any in-flight request. */
  reset: (options?: ResetOptions) => void;
}

const resetters = new Set<(options: ResetOptions) => void>();

/** Resets every resource created via `createResource` (call on user change). */
export function resetAllResources(options: ResetOptions = {}): void {
  resetters.forEach((reset) => reset(options));
}

export function createResource<T>(
  fetcher: () => Promise<T>,
  empty: T,
  errorLabel = "Failed to load",
): Resource<T> {
  const initial = (): ResourceState<T> => ({ data: empty, loading: true, error: null });

  let state = initial();
  let generation = 0;
  let inflight: Promise<void> | null = null;
  // Whether any fetch has succeeded since creation/reset; until then a new
  // request shows `loading` again so pages don't render a bogus empty state.
  let hasLoaded = false;
  const listeners = new Set<() => void>();

  const setState = (next: ResourceState<T>) => {
    state = next;
    listeners.forEach((listener) => {
      // A throwing listener must not starve the others or reject the request.
      try {
        listener();
      } catch {
        // ignore
      }
    });
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const getSnapshot = () => state;

  const start = (): Promise<void> => {
    const myGeneration = ++generation;
    if (!hasLoaded && !state.loading) setState({ ...state, loading: true });
    const promise = (async () => {
      let next: ResourceState<T>;
      try {
        // Promise.resolve().then(...) makes a synchronous throw behave like a
        // rejection and keeps this async, so `inflight` is assigned below
        // before it can be cleared.
        next = { data: await Promise.resolve().then(fetcher), loading: false, error: null };
      } catch (err) {
        next = {
          data: state.data,
          loading: false,
          error: err instanceof Error ? err.message : errorLabel,
        };
      }
      // Superseded by a newer refresh() or discarded by reset(): don't write.
      if (myGeneration !== generation) {
        // Wait for the latest request so `await refresh()` never reads stale state.
        if (inflight) await inflight;
        return;
      }
      // Current generation, so `inflight` is this request.
      inflight = null;
      if (next.error === null) hasLoaded = true;
      // A failed refetch keeps the previous data and only sets `error`.
      setState(next);
    })();
    inflight = promise;
    return promise;
  };

  /** Note: after a reset with no mounted listeners, a superseded refresh
   *  resolves immediately with the store empty/loading. */
  const refresh = (): Promise<void> => start();

  const reset = ({ refetch = true }: ResetOptions = {}) => {
    generation++;
    inflight = null;
    hasLoaded = false;
    setState(initial());
    // A mounted consumer won't re-run its mount effect, so refetch for it.
    if (refetch && listeners.size > 0) void start();
  };
  resetters.add(reset);

  const useResource = (): ResourceState<T> => {
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    // Revalidate on mount, joining a request that is already in flight
    // (also collapses the StrictMode double mount into one request).
    const revalidate = useCallback(() => {
      void (inflight ?? start());
    }, []);
    useEffect(revalidate, [revalidate]);
    return snapshot;
  };

  return { useResource, refresh, reset };
}
