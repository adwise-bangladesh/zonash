import { Suspense, useEffect, useMemo, useRef } from "react";
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { listProducts } from "@/lib/woo.functions";
import type { WooProduct } from "@/lib/woo.server";
import {
  dedupeFeedPages,
  getFeedNextPageParam,
  FEED_PER_PAGE,
  feedKeyFor,
  recommendedFeedKey,
} from "@/lib/home-feed";
import { recommendedInfiniteOptions } from "@/lib/recommended-feed";
import { BigProductGrid } from "./BigProductGrid";

type Orderby = "date" | "price" | "popularity" | "rating" | "title";
type Order = "asc" | "desc";

/** Grid placeholder used while a feed variant (sort change, first load) streams in. */
export function FeedGridSkeleton({ columns = 3 }: { columns?: 2 | 3 }) {
  return (
    <div
      aria-hidden="true"
      data-vr="feed-grid"
      className={
        columns === 3
          ? "grid grid-cols-3 gap-1.5 px-[5px] pb-6"
          : "grid grid-cols-2 gap-2 px-[5px] pb-6"
      }
    >
      {Array.from({ length: columns === 3 ? 9 : 8 }).map((_, i) => (
        <div
          key={i}
          data-vr="feed-card"
          className="skeleton-row-fade flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-border/60"
          style={{ animationDelay: `${i * 45}ms` }}
        >

          <div className="aspect-square w-full skeleton-shimmer rounded-none" />
          {/*
            Geometry mirrors `BigCard`'s body exactly (see BigProductGrid):
            `p-2.5` + `gap-1.5`, a fixed 34px two-line title box and a
            `mt-0.5` price row at the real 13px/md:15px leading-none height.
            The previous `p-2` + 12/12/14px bars stood 11px shorter than the
            card it replaced, so every swap nudged the whole feed upward.
          */}
          <div className="flex flex-col gap-1.5 p-2.5">
            <div className="flex h-[34px] flex-col justify-between">
              <div className="h-3 w-[92%] skeleton-shimmer rounded" />
              <div className="h-3 w-[70%] skeleton-shimmer rounded" />
            </div>
            <div className="mt-0.5 h-[13px] w-12 skeleton-shimmer rounded md:h-[15px]" />
          </div>

        </div>
      ))}
    </div>
  );
}

/**
 * Feed + suspense boundary. Keeps sort switches inside a local skeleton instead
 * of bubbling to the route-level pending component.
 */
export function InfiniteFeedSection(props: {
  orderby?: Orderby;
  order?: Order;
  columns?: 2 | 3;
  recommended?: boolean;
}) {
  return (
    <Suspense fallback={<FeedGridSkeleton columns={props.columns ?? 3} />}>
      <InfiniteFeed {...props} />
    </Suspense>
  );
}

export function InfiniteFeed({
  orderby = "date",
  order,
  columns = 3,
  recommended = false,
  excludeId,
}: {
  orderby?: Orderby;
  order?: Order;
  columns?: 2 | 3;
  /** Product to drop from the feed (e.g. the product page you're already on). */
  excludeId?: number;
  /**
   * Curated ordering: featured products first, then best sellers. Used for
   * "Recommended for you" surfaces, where newest-published was misleading.
   */
  recommended?: boolean;
} = {}) {
  const sentinel = useRef<HTMLDivElement>(null);

  const queryKey = useMemo(
    () => (recommended ? recommendedFeedKey : feedKeyFor(orderby, order)),
    [recommended, orderby, order],
  );

  // Suspense (not `useInfiniteQuery`) so the server waits for the streamed
  // first page: rendering an empty feed on the server and a populated one on
  // the client made React discard and re-render the entire tree on hydration.
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isError, refetch } =
    useSuspenseInfiniteQuery(
      recommended
        ? // Reuse the SSR-prefetched config verbatim. Re-declaring it here (as
          // this component used to) meant the recommended feed's paging rules
          // lived in two places; the cursor rewrite would have left the client
          // walking page numbers while the server handed it row offsets.
          recommendedInfiniteOptions
        : {
            queryKey,
            initialPageParam: 1,
            queryFn: ({ pageParam }) =>
              listProducts({
                data: { page: pageParam as number, perPage: FEED_PER_PAGE, orderby, order },
              }),
            getNextPageParam: (last, all) => getFeedNextPageParam(last, all, FEED_PER_PAGE),
            staleTime: 60_000,
            retry: 1,
          },
    );


  // Latest fetch state is read through a ref so the observer is created ONCE
  // per feed variant. Keying the effect on `isFetchingNextPage` tore the
  // IntersectionObserver down and rebuilt it twice per page load (fetch start +
  // fetch end); during that gap a fast scroller passed the sentinel with no
  // observer attached and the feed stalled until the next scroll event.
  //
  // The sync happens in an effect, not inline during render: React 19 can start
  // a concurrent render, abandon it and keep the committed tree. Writing the ref
  // in the render body let an abandoned render's values (a stale
  // `fetchNextPage`, an `isFetchingNextPage` that never happened) survive as the
  // observer's view of the world — a real "feed stops loading" class of bug
  // under the interrupt-heavy rendering that fast scrolling produces.
  const state = useRef({ hasNextPage, isFetchingNextPage, fetchNextPage });
  useEffect(() => {
    state.current = { hasNextPage, isFetchingNextPage, fetchNextPage };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);


  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      (entries) => {
        const s = state.current;
        if (entries[0]?.isIntersecting && s.hasNextPage && !s.isFetchingNextPage) {
          void s.fetchNextPage();
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [queryKey]);

  // Dedupe is O(pages x per_page); at page 10 that is 180 items re-scanned on
  // every render (scroll, hover, focus). Memoize on the page array identity so
  // it only runs when a new page actually lands.
  const products = useMemo(() => {
    const all = dedupeFeedPages<WooProduct>(
      data?.pages as { products: WooProduct[] }[] | undefined,
    );
    return excludeId ? all.filter((p) => p.id !== excludeId) : all;
  }, [data?.pages, excludeId]);

  // Server functions resolve with `{ products, error }` instead of throwing.
  const softError = data?.pages?.some((p) => (p as { error?: string | null })?.error) ?? false;
  const failed = isError || (softError && products.length === 0);

  return (
    <>
      <BigProductGrid products={products} columns={columns} />
      <div
        ref={sentinel}
        aria-live="polite"
        aria-busy={isFetchingNextPage}
        className="flex items-center justify-center py-6 text-muted-foreground"
      >
        {isFetchingNextPage && (
          <span className="inline-flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading more…
          </span>
        )}
        {!isFetchingNextPage && failed && (
          <div role="alert" className="flex flex-col items-center gap-2 text-sm">
            <span>Products couldn't be loaded right now.</span>
            <button
              type="button"
              onClick={() => void refetch()}
              className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-surface-muted"
            >
              Try again
            </button>
          </div>
        )}
        {!isFetchingNextPage && !failed && products.length === 0 && (
          <span className="text-xs text-muted-foreground/70">No products available yet.</span>
        )}
        {!hasNextPage && products.length > 0 && (
          <span className="text-xs text-muted-foreground/70">You've reached the end ✦</span>
        )}
      </div>
    </>
  );
}
