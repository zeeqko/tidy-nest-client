import { useCallback, useEffect, useState } from "react";
import { listCategories, type ApiCategory } from "../api/categories";
import { toUiCategory } from "../data/categories";
import type { Category } from "../types";

interface UseCategoriesResult {
  /** Raw backend categories with nested subCategories, tags, and item stats. */
  apiCategories: ApiCategory[];
  /** UI-shaped categories (string id, label, icon image). Excludes "All". */
  categories: Category[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** Loads categories (with nested tags) from the backend in a single request. */
export function useCategories(): UseCategoriesResult {
  const [apiCategories, setApiCategories] = useState<ApiCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setApiCategories(await listCategories());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    apiCategories,
    categories: apiCategories.map(toUiCategory),
    loading,
    error,
    refresh,
  };
}
