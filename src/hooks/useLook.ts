import { useCallback, useEffect, useState } from "react";
import { getLook, type ApiLook } from "../api/looks";

interface UseLookResult {
  look: ApiLook | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** Loads a single saved look from the backend by id. Mirrors `useLooks`'
 *  shape/pattern exactly, just over `getLook` instead of `listLooks`. `id`
 *  is optional so callers can pass `useParams()`'s possibly-undefined route
 *  param straight through without a guard. */
export function useLook(id: string | undefined): UseLookResult {
  const [look, setLook] = useState<ApiLook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!id) {
      setLook(null);
      setError("look not found");
      setLoading(false);
      return;
    }
    // Reset before the fetch, not just on success: this hook is keyed by a
    // route param that can change without the component remounting (e.g.
    // browser back/forward between two /stylebook/{id} URLs), so a stale
    // `look` from the *previous* id must not stay on screen — under a
    // failed/404 refetch for the new id — while this one is in flight or
    // if it errors.
    setLoading(true);
    setLook(null);
    try {
      setLook(await getLook(id));
      setError(null);
    } catch (err) {
      setLook(null);
      setError(err instanceof Error ? err.message : "Failed to load this look");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { look, loading, error, refresh };
}
