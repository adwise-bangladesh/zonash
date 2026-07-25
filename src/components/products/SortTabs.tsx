import { Link } from "@tanstack/react-router";
import { Zap } from "lucide-react";

export type SortKey =
  | "recommended"
  | "new"
  | "price-asc"
  | "price-desc"
  | "rating"
  | "title";

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

export function SortTabs({ active }: { active: SortKey }) {
  return (
    <nav
      aria-label="Sort products"
      className="sticky top-14 z-30 border-b border-border bg-background/95 backdrop-blur md:top-16"
    >
      <div className="flex gap-4 overflow-x-auto py-2 pl-[5px] pr-4 text-[12.5px] font-semibold [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:pl-4">
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
              search={(prev) => {
                const next = { ...(prev as Record<string, unknown>) };
                if (opt.key === "recommended") delete next.sort;
                else next.sort = opt.key;
                return next as never;
              }}
              className={
                isActive
                  ? `relative shrink-0 text-primary${opt.key === "new" ? " inline-flex items-center gap-1" : ""}`
                  : opt.key === "new"
                    ? "inline-flex shrink-0 items-center gap-1 text-emerald-600"
                    : "shrink-0 text-muted-foreground hover:text-foreground"
              }
              aria-current={isActive ? "page" : undefined}
            >
              {opt.key === "new" && (
                <Zap className="h-3.5 w-3.5 fill-emerald-500 text-emerald-500" aria-hidden="true" />
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
