import { describe, expect, it } from "vitest";
import { clampPage, pageCount, pageLabel, pageSlice } from "../src/lib/paging";

describe("paging", () => {
  it("counts pages, with one page for an empty list", () => {
    expect(pageCount(0, 3)).toBe(1);
    expect(pageCount(3, 3)).toBe(1);
    expect(pageCount(4, 3)).toBe(2);
    expect(pageCount(10, 3)).toBe(4);
  });

  it("refuses a page size that is not positive", () => {
    expect(() => pageCount(5, 0)).toThrow(RangeError);
  });

  it("keeps the page inside the list when the list shrinks", () => {
    expect(clampPage(5, 7, 3)).toBe(2);
    expect(clampPage(-1, 7, 3)).toBe(0);
    expect(clampPage(2, 0, 3)).toBe(0);
  });

  it("slices one page, the last one short", () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    expect(pageSlice(items, 0, 3)).toEqual([1, 2, 3]);
    expect(pageSlice(items, 2, 3)).toEqual([7]);
    expect(pageSlice(items, 9, 3)).toEqual([7]);
  });

  it("labels the page from one", () => {
    expect(pageLabel(0, 5)).toBe("1 of 5");
  });
});
