import { useMemo } from "react";
import type { ApiCategory } from "../api/categories";
import { listItems, type ApiInventoryItem } from "../api/inventory";
import { toOrganizingItem } from "../data/presentation";
import { createResource } from "../lib/resourceCache";
import type { OrganizingItem } from "../types";

interface UseItemsResult {
  items: OrganizingItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// One shared store per resource; the empty array is shared, so never mutate it.
const store = createResource(listItems, [] as ApiInventoryItem[], "Failed to load items");

// Stable default so an omitted `categories` argument doesn't defeat the memo.
const EMPTY_CATEGORIES: ApiCategory[] = [];

/** Loads inventory items from the backend and maps them to the UI shape.
 *  `categories` (pass the caller's already-loaded `apiCategories`) lets each
 *  item resolve its category's current colour/icon by id — so a category
 *  rename or recolor is reflected instantly, with no extra network request,
 *  the moment `categories` updates. */
export function useItems(categories: ApiCategory[] = EMPTY_CATEGORIES): UseItemsResult {
  const { data: apiItems, loading, error } = store.useResource();

  const items = useMemo(
    () => apiItems.map((item) => toOrganizingItem(item, categories)),
    [apiItems, categories],
  );

  return { items, loading, error, refresh: store.refresh };
}
