import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { listProducts } from "@/lib/woo.functions";
import type { WooProduct } from "@/lib/woo.server";
import {
  dedupeFeedPages,
  getFeedNextPageParam,
  FEED_PER_PAGE,
  feedQueryKey,
} from "@/lib/home-feed";
import { BigProductGrid } from "./BigProductGrid";


export function InfiniteFeed() {
  const sentinel = useRef<HTMLDivElement>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: feedQueryKey,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listProducts({
        data: { page: pageParam as number, perPage: FEED_PER_PAGE, orderby: "date" },
      }),
    getNextPageParam: (last, all) => getFeedNextPageParam(last, all, FEED_PER_PAGE),
    staleTime: 60_000,
  });

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const products = dedupeFeedPages<WooProduct>(
    data?.pages as { products: WooProduct[] }[] | undefined,
  );

  return (
    <>
      <BigProductGrid products={products} columns={3} />
      <div ref={sentinel} className="flex items-center justify-center py-6 text-muted-foreground">
        {(isLoading || isFetchingNextPage) && (
          <span className="inline-flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading more…
          </span>
        )}
        {!hasNextPage && products.length > 0 && (
          <span className="text-xs text-muted-foreground/70">You've reached the end ✦</span>
        )}
      </div>
    </>
  );
}
