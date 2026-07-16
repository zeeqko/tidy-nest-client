import { useCallback, useEffect, useState } from "react";
import { listItems } from "../api/inventory";
import { toOrganizingItem } from "../data/presentation";
import type { OrganizingItem } from "../types";

interface UseItemsResult {
  items: OrganizingItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** Loads inventory items from the backend and maps them to the UI shape. */
export function useItems(): UseItemsResult {
  const [items, setItems] = useState<OrganizingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const apiItems = await listItems();
      setItems(apiItems.map(toOrganizingItem));
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

  return { items, loading, error, refresh };
}
