import { useCallback, useEffect, useState } from "react";
import { listLooks, type ApiLook } from "../api/looks";

interface UseLooksResult {
  looks: ApiLook[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** Loads the current user's saved looks from the backend. */
export function useLooks(): UseLooksResult {
  const [looks, setLooks] = useState<ApiLook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLooks(await listLooks());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load looks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { looks, loading, error, refresh };
}
