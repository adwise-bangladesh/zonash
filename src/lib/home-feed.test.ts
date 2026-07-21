import { describe, expect, it } from "vitest";
import { dedupeFeedPages, getFeedNextPageParam, type FeedPage } from "./home-feed";

const PER_PAGE = 18;
const full = (start: number, count = PER_PAGE): FeedPage =>
  ({ products: Array.from({ length: count }, (_, i) => ({ id: start + i })) });

describe("getFeedNextPageParam", () => {
  it("returns next page index when the last page is full", () => {
    const p1 = full(1);
    expect(getFeedNextPageParam(p1, [p1], PER_PAGE)).toBe(2);
  });

  it("stops on an empty page", () => {
    const p1 = full(1);
    const empty: FeedPage = { products: [] };
    expect(getFeedNextPageParam(empty, [p1, empty], PER_PAGE)).toBeUndefined();
  });

  it("stops on a partial page (WooCommerce tail)", () => {
    const partial = full(37, 5); // 5 < PER_PAGE
    expect(getFeedNextPageParam(partial, [full(1), full(19), partial], PER_PAGE)).toBeUndefined();
  });

  it("stops when the payload is missing or malformed (no infinite spinner)", () => {
    expect(getFeedNextPageParam(undefined, [], PER_PAGE)).toBeUndefined();
    // Simulate an error payload with no products array.
    expect(
      getFeedNextPageParam({ products: [], error: "boom" }, [], PER_PAGE),
    ).toBeUndefined();
  });

  it("keeps paginating across many full pages", () => {
    const pages = [full(1), full(19), full(37), full(55)];
    expect(getFeedNextPageParam(pages[3], pages, PER_PAGE)).toBe(5);
  });
});

describe("dedupeFeedPages", () => {
  it("returns [] for undefined/empty input", () => {
    expect(dedupeFeedPages(undefined)).toEqual([]);
    expect(dedupeFeedPages([])).toEqual([]);
  });

  it("preserves order and removes duplicate ids across pages", () => {
    const pages: FeedPage[] = [
      { products: [{ id: 1 }, { id: 2 }, { id: 3 }] },
      { products: [{ id: 3 }, { id: 4 }, { id: 2 }, { id: 5 }] },
    ];
    expect(dedupeFeedPages(pages).map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("de-dupes within a single page as well", () => {
    const pages: FeedPage[] = [{ products: [{ id: 7 }, { id: 7 }, { id: 8 }] }];
    expect(dedupeFeedPages(pages).map((p) => p.id)).toEqual([7, 8]);
  });

  it("tolerates pages with a missing products array", () => {
    const pages = [
      { products: [{ id: 1 }] },
      { products: undefined as unknown as { id: number }[] },
      { products: [{ id: 2 }] },
    ] as FeedPage[];
    expect(dedupeFeedPages(pages).map((p) => p.id)).toEqual([1, 2]);
  });
});
