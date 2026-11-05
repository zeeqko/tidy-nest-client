/** itemId -> number of placements of that inventory item. */
export function countsByItemId(items: readonly { itemId: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[item.itemId] = (counts[item.itemId] ?? 0) + 1;
  return counts;
}

/** Placement id of the most recently added placement of `itemId` (the last
 *  one in array order), or null when it is not on the canvas. */
export function lastPlacementId(
  items: readonly { id: string; itemId: string }[],
  itemId: string,
): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].itemId === itemId) return items[i].id;
  }
  return null;
}
