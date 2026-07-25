import { Link } from "@tanstack/react-router";
import { Search, ShoppingBag } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { useCart } from "@/lib/cart";

/**
 * Storefront header. Search is a dedicated full page (`/search`) rather than a
 * dropdown — the icon and the tap target simply navigate there.
 */
export function SiteHeader() {
  const { count: cartCount } = useCart();

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-md">
      <div className="container-page flex h-14 items-center justify-between gap-3 md:h-16">
        <Link to="/" aria-label="Home" className="shrink-0">
          <Logo size={26} />
        </Link>

        <div className="flex shrink-0 items-center gap-1">
          <Link
            to="/search"
            aria-label="Search products"
            preload="intent"
            className="grid h-9 w-9 place-items-center rounded-full text-foreground/80 transition-colors hover:bg-primary/[0.06] hover:text-primary md:h-10 md:w-10"
          >
            <Search className="h-[18px] w-[18px]" />
          </Link>
          {/* Account entry point intentionally omitted from the storefront
              header — customers reach their orders through the checkout /
              order-lookup flow instead. */}

          <Link
            to="/cart"
            aria-label={cartCount > 0 ? `Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}` : "Cart"}
            className="relative grid h-9 w-9 place-items-center rounded-full text-foreground/80 transition-colors hover:bg-primary/[0.06] hover:text-primary md:h-10 md:w-10"
          >
            <ShoppingBag className="h-[18px] w-[18px]" />
            {cartCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background"
              >
                {cartCount > 9 ? "9+" : cartCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
