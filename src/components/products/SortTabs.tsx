import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Zap } from "lucide-react";


export type SortKey = "recommended" | "new" | "price-asc" | "price-desc" | "rating" | "title";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recommended", label: "Recommended" },
  { key: "new", label: "New Arrivals" },
  { key: "price-asc", label: "Price: Low to High" },
  { key: "price-desc", label: "Price: High to Low" },
  { key: "rating", label: "Top Rated" },
  { key: "title", label: "A–Z" },
];

export function sortToWoo(sort: SortKey): {
  orderby: "date" | "price" | "popularity" | "rating" | "title";
  order: "asc" | "desc";
} {
  switch (sort) {
    case "new":
      return { orderby: "date", order: "desc" };
    case "price-asc":
      return { orderby: "price", order: "asc" };
    case "price-desc":
      return { orderby: "price", order: "desc" };
    case "rating":
      return { orderby: "rating", order: "desc" };
    case "title":
      return { orderby: "title", order: "asc" };
    case "recommended":
    default:
      return { orderby: "popularity", order: "desc" };
  }
}

export function SortTabs({
  active,
  to = "/products",
  params,
}: {
  active: SortKey;
  /** Route the tabs link to; defaults to the shop listing. */
  to?: string;
  params?: Record<string, string>;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  // The sticky offset was hard-coded to 57px (the mobile header height). The
  // site header is 65px from `md` up (larger logo lockup), so on desktop the
  // tab strip stuck 8px *underneath* the header: the active underline was
  // clipped and product cards scrolled visibly through the gap. Measure the
  // real header instead of assuming one breakpoint's height.
  const [top, setTop] = useState(57);
  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const sync = () => setTop(Math.round(header.getBoundingClientRect().height));
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  // The strip scrolls horizontally and always starts at offset 0, so landing on
  // (or sharing) a link sorted by "Top Rated" / "A–Z" showed "Recommended" with
  // the active tab and its underline entirely off-screen — the shopper had no
  // visible signal that a sort was applied. Bring the active tab into view
  // after paint, without scrolling the page itself.
  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>('[aria-current="page"]');
    const box = scroller.current;
    if (!el || !box) return;
    const target = el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2;
    box.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [active]);

  return (
    <nav
      aria-label="Sort products"
      style={{ top }}
      className="sticky z-30 border-b border-border bg-background/95 backdrop-blur"
    >
      <div
        ref={scroller}
        className="flex gap-4 overflow-x-auto py-2 pl-[5px] pr-4 text-[12.5px] font-semibold [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:pl-4"
      >

        {SORT_OPTIONS.map((opt) => {
          const isActive = opt.key === active;
          return (
            <Link
              key={opt.key}
              to="/products"
              // Function form: sorting inside a search/category view previously
              // replaced the whole search object, silently dropping `q`,
              // `category` and `featured` and dumping the shopper back into the
              // unfiltered shop.
              search={(prev: Record<string, unknown>) => {
                const next = { ...prev };
                if (opt.key === "recommended") delete next.sort;
                else next.sort = opt.key;
                return next as never;
              }}
              className={
                isActive
                  ? `relative shrink-0 text-primary${opt.key === "new" ? " inline-flex items-center gap-1" : ""}`
                  : opt.key === "new"
                    ? "inline-flex shrink-0 items-center gap-1 text-success"
                    : "shrink-0 text-muted-foreground hover:text-foreground"
              }
              aria-current={isActive ? "page" : undefined}
            >
              {opt.key === "new" && (
                <Zap className="h-3.5 w-3.5 fill-success text-success" aria-hidden="true" />
              )}
              {opt.label}
              {isActive && (
                <span className="absolute inset-x-1 -bottom-2 h-[2.5px] rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
