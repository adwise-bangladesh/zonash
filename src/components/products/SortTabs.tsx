import { Link } from "@tanstack/react-router";
import { Sparkles, Zap, ArrowDownWideNarrow, ArrowUpNarrowWide, Star, AtSign } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type SortKey =
  | "recommended"
  | "new"
  | "price-asc"
  | "price-desc"
  | "rating"
  | "title";

export const SORT_OPTIONS: {
  key: SortKey;
  label: string;
  icon?: LucideIcon;
  iconClass?: string;
}[] = [
  { key: "recommended", label: "Recommended", icon: Sparkles, iconClass: "text-primary" },
  { key: "new", label: "New Arrivals", icon: Zap, iconClass: "fill-emerald-500 text-emerald-500" },
  { key: "price-asc", label: "Price: Low to High", icon: ArrowUpNarrowWide },
  { key: "price-desc", label: "Price: High to Low", icon: ArrowDownWideNarrow },
  { key: "rating", label: "Top Rated", icon: Star, iconClass: "fill-amber-400 text-amber-500" },
  { key: "title", label: "A–Z", icon: AtSign },
];

export function sortToWoo(sort: SortKey): { orderby: "date" | "price" | "popularity" | "rating" | "title"; order: "asc" | "desc" } {
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
          const Icon = opt.icon;
          return (
            <Link
              key={opt.key}
              to="/products"
              search={opt.key === "recommended" ? {} : { sort: opt.key }}
              className={
                isActive
                  ? "relative inline-flex shrink-0 items-center gap-1 text-primary"
                  : "inline-flex shrink-0 items-center gap-1 text-muted-foreground hover:text-foreground"
              }
              aria-current={isActive ? "page" : undefined}
            >
              {Icon && <Icon className={`h-3.5 w-3.5 ${opt.iconClass ?? ""}`} />}
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
