/** Page maths for lists that page instead of growing. Pages are counted from 0. */

/** How many pages `total` items fill, never fewer than one so an empty list still has a page. */
export function pageCount(total: number, size: number): number {
  if (size <= 0) throw new RangeError("page size must be positive");
  return Math.max(1, Math.ceil(total / size));
}

/** A page index kept inside the list, for when the list shrinks under the reader. */
export function clampPage(page: number, total: number, size: number): number {
  return Math.min(Math.max(0, page), pageCount(total, size) - 1);
}

/** The items on one page. */
export function pageSlice<T>(items: readonly T[], page: number, size: number): T[] {
  const p = clampPage(page, items.length, size);
  return items.slice(p * size, p * size + size);
}

/** "2 of 5", the label between the pager's arrows. */
export const pageLabel = (page: number, count: number) => `${page + 1} of ${count}`;
