/** The one item-grid definition shared by All Items and Category: 3 columns
 *  below sm, then fluid rem-based auto-fill columns that fill the page
 *  container (no px caps). */
export const ITEM_GRID =
  "grid w-full grid-cols-3 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] sm:gap-4 md:gap-6";

/** The Sort/filter row that sits directly above the grid on both pages. The
 *  negative margins cancel part of the page's flex gap so the row-to-grid
 *  distance is identical everywhere (0.75rem). */
export const ITEM_SORT_ROW =
  "-mb-1 flex w-full flex-wrap gap-2 sm:-mb-6 sm:justify-end sm:gap-0";
