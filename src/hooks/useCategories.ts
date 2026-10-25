import { useMemo } from "react";
import { listCategories, type ApiCategory } from "../api/categories";
import { toUiCategory } from "../data/categories";
import { createResource } from "../lib/resourceCache";
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

// One shared store per resource; the empty array is shared, so never mutate it.
const store = createResource(listCategories, [] as ApiCategory[], "Failed to load categories");

/** Loads categories (with nested tags) from the backend in a single request. */
export function useCategories(): UseCategoriesResult {
  const { data: apiCategories, loading, error } = store.useResource();

  const categories = useMemo(() => apiCategories.map(toUiCategory), [apiCategories]);

  return {
    apiCategories,
    categories,
    loading,
    error,
    refresh: store.refresh,
  };
}
