interface HomeSummaryInput {
  itemCount: number;
  categoryCount: number;
  /** True until both categories and items have finished loading. */
  loading: boolean;
  itemsFailed: boolean;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** The line under the Home greeting. Null means "show nothing": still
 *  loading (so "0 things" never flashes), no categories (the empty state
 *  explains it), or items failed to load (the error text covers it). */
export function homeSummary({ itemCount, categoryCount, loading, itemsFailed }: HomeSummaryInput): string | null {
  if (loading || itemsFailed || categoryCount === 0) return null;
  if (itemCount === 0) return "Nothing tucked away yet";
  return `${plural(itemCount, "thing", "things")} across ${plural(categoryCount, "category", "categories")}`;
}
