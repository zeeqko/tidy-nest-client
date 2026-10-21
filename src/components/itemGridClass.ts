/** Shared columns/gap for every item grid (All Items, Category). Call sites
 *  append their own full-literal max-width class so Tailwind can detect it. */
export const ITEM_GRID_BASE =
  "grid w-full grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-4 md:gap-6 xl:grid-cols-5";
