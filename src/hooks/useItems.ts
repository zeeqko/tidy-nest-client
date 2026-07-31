import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiCategory } from "../api/categories";
import { listItems, type ApiInventoryItem } from "../api/inventory";
import { toOrganizingItem } from "../data/presentation";
import type { OrganizingItem } from "../types";

interface UseItemsResult {
  items: OrganizingItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** Loads inventory items from the backend and maps them to the UI shape.
 *  `categories` (pass the caller's already-loaded `apiCategories`) lets each
 *  item resolve its category's current colour/icon by id — so a category
 *  rename or recolor is reflected instantly, with no extra network request,
 *  the moment `categories` updates. */
export function useItems(categories: ApiCategory[] = []): UseItemsResult {
  const [apiItems, setApiItems] = useState<ApiInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setApiItems(await listItems());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const items = useMemo(
    () => apiItems.map((item) => toOrganizingItem(item, categories)),
    [apiItems, categories],
  );

  return { items, loading, error, refresh };
}
