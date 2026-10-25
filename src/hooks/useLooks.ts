import { listLooks, type ApiLook } from "../api/looks";
import { createResource } from "../lib/resourceCache";

interface UseLooksResult {
  looks: ApiLook[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// One shared store per resource; the empty array is shared, so never mutate it.
const store = createResource(listLooks, [] as ApiLook[], "Failed to load looks");

/** Refetches the shared looks list after a look is created/edited/deleted
 *  outside StyleBookPage, so the list is fresh when it mounts. Waits at most
 *  `ms` so a hung request can't strand the caller; never rejects. */
export async function refreshLooksBounded(ms = 3000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  try {
    await Promise.race([store.refresh(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Loads the current user's saved looks from the backend. */
export function useLooks(): UseLooksResult {
  const { data: looks, loading, error } = store.useResource();
  return { looks, loading, error, refresh: store.refresh };
}
