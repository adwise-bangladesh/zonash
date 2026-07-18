import { Link } from "@tanstack/react-router";
import { Gem } from "lucide-react";
import type { WooCategory } from "@/lib/woo.functions";

function CategoryItem({
  cat,
  imageClass,
  labelClass,
  wrapperClass,
  eager,
}: {
  cat: WooCategory;
  imageClass: string;
  labelClass: string;
  wrapperClass: string;
  eager?: boolean;
}) {
  return (
    <Link
      to="/products"
      search={{ category: cat.slug }}
      preload="intent"
      className={`group flex flex-col items-center ${wrapperClass}`}
    >
      <span
        className={`block overflow-hidden rounded-full bg-surface-muted ring-1 ring-border transition-all duration-200 group-hover:ring-primary/40 ${imageClass}`}
      >
        {cat.image?.src ? (
          <img
            src={cat.image.src}
            alt=""
            width={200}
            height={200}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-muted-foreground/50">
            <Gem className="h-6 w-6" />
          </span>
        )}
      </span>
      <span className={`text-center font-medium leading-tight text-foreground ${labelClass}`}>
        {cat.name}
      </span>
    </Link>
  );
}

export function CategoryStrip({ categories }: { categories: WooCategory[] }) {
  if (!categories || categories.length === 0) return null;
  return (
    <section aria-labelledby="categories-heading" className="bg-background pb-4 pt-6 md:pb-8 md:pt-10">
      <div className="container-page mb-4 md:mb-6">
        <h2 id="categories-heading" className="font-display text-2xl md:text-3xl">
          Shop by category
        </h2>
      </div>

      {/* Mobile: horizontal scroll, 2 rows */}
      <div className="scroll-snap-x overflow-x-auto pb-2 md:hidden">
        <div className="grid w-max auto-cols-[86px] grid-flow-col grid-rows-2 gap-x-3 gap-y-3 px-3">
          {categories.map((cat, i) => (
            <CategoryItem
              key={cat.slug}
              cat={cat}
              wrapperClass="w-[86px] shrink-0 snap-start gap-1.5"
              imageClass="h-[76px] w-[76px]"
              labelClass="text-[11px]"
              eager={i < 2}
            />
          ))}
        </div>
      </div>

      {/* Desktop */}
      <div className="container-page hidden md:block">
        <div className="grid grid-cols-8 gap-x-4 gap-y-6 lg:grid-cols-10">
          {categories.slice(0, 20).map((cat, i) => (
            <CategoryItem
              key={cat.slug}
              cat={cat}
              wrapperClass="w-full gap-2"
              imageClass="aspect-square w-full"
              labelClass="text-xs"
              eager={i < 2}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
