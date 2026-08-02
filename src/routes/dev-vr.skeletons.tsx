import { createFileRoute, notFound } from "@tanstack/react-router";
import { FeedGridSkeleton } from "@/components/home/InfiniteFeed";
import { DealsStripSkeleton } from "@/components/home/skeletons";

/**
 * Visual-regression harness (development only).
 *
 * The skeletons only appear for a few hundred milliseconds on `/`, and only
 * when WooCommerce is slow — impossible to screenshot reliably. This route
 * renders them in isolation, on demand, so `tests/visual/skeleton-vr.py` can
 * capture stable baselines per breakpoint.
 *
 * `notFound()` in `beforeLoad` keeps it out of production: the route file still
 * ships (tree-shaking a file route is not possible) but answers 404 there, so
 * it is not a crawlable or linkable surface.
 */
export const Route = createFileRoute("/dev-vr/skeletons")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Skeleton harness" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Harness,
});

function Harness() {
  return (
    <div className="min-h-dvh bg-surface-muted/40">
      {/*
        Same 480px storefront frame the real pages use, so measurements taken
        here are directly comparable with `/`.
      */}
      <div data-vr-case="deals" className="bg-background pt-2">
        <DealsStripSkeleton />
      </div>
      <div data-vr-case="feed-2">
        <FeedGridSkeleton columns={2} />
      </div>
      <div data-vr-case="feed-3">
        <FeedGridSkeleton columns={3} />
      </div>
    </div>
  );
}
