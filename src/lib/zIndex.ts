/** Re-numbers z-indexes to 0..n-1 by stacking order, keeping the array order
 *  and every other field. Stable: items with equal zIndex keep their relative
 *  array order (the earlier one stays below). The canvas hands out sparse
 *  values (zone bands of 1000, "send to back" can go negative); saved looks
 *  get dense, non-negative ones so CSS z-index consumers (LookCard) never
 *  paint an item over the card's own chrome or behind its background. */
export function normalizeZIndices<T extends { zIndex: number }>(items: T[]): T[] {
  const order = items
    .map((item, index) => ({ zIndex: item.zIndex, index }))
    .sort((a, b) => a.zIndex - b.zIndex || a.index - b.index);
  const rank = new Array<number>(items.length);
  order.forEach((entry, position) => {
    rank[entry.index] = position;
  });
  return items.map((item, index) => ({ ...item, zIndex: rank[index] }));
}
