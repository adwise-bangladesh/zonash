import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Search, ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart";

/**
 * Compact sticky header for cart, checkout, and category pages.
 * Back arrow · title (+ count) · search · cart.
 */
export function CheckoutHeader({
  title,
  count,
  showBack = true,
  backTo = "/",
}: {
  title: string;
  count?: number;
  showBack?: boolean;
  backTo?: string;
}) {
  const { count: cartCount } = useCart();
  const navigate = useNavigate();
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
    else navigate({ to: backTo as "/" });
  };

  return (
    <header className="sticky top-0 z-40 flex h-11 items-center gap-1 border-b border-border bg-background/95 px-3 backdrop-blur md:h-14 md:px-6">
      {showBack ? (
        <button type="button" onClick={goBack} aria-label="Back" className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-muted">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
      ) : (
        <span className="h-9 w-9 shrink-0" aria-hidden="true" />
      )}
      <h1 className="min-w-0 flex-1 truncate text-sm font-semibold md:text-base">
        {title}
        {typeof count === "number" && count > 0 && (
          <span className="ml-1 font-normal text-muted-foreground">({count})</span>
        )}
      </h1>
      <div className="flex shrink-0 items-center gap-0.5">
        <Link to="/search" aria-label="Search products" preload="intent" className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted">
          <Search className="h-5 w-5" aria-hidden="true" />
        </Link>
        <Link to="/cart" aria-label="Cart" className="relative grid h-9 w-9 place-items-center rounded-full hover:bg-muted">
          <ShoppingBag className="h-5 w-5" aria-hidden="true" />
          {cartCount > 0 && (
            <span className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {cartCount > 9 ? "9+" : cartCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
