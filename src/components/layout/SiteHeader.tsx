import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search, ShoppingBag, User, Heart } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { useCart } from "@/lib/cart";

const QUICK = ["Rings", "Earrings", "Necklaces", "Bridal", "Under 2000 Tk"];

export function SiteHeader() {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const { count: cartCount } = useCart();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    navigate({ to: "/products", search: term ? { q: term } : {} });
  };

  const goTerm = (term: string) => {
    const t = term.trim();
    navigate({ to: "/products", search: t ? { q: t } : {} });
  };

  // Shared premium pill search — identical on mobile & desktop
  const SearchPill = ({ compact = false }: { compact?: boolean }) => (
    <form onSubmit={submit} role="search" className="w-full">
      <div className="group relative flex w-full items-center gap-2 rounded-full border border-border bg-surface-muted/60 pl-4 pr-1.5 py-1.5 transition-all focus-within:border-primary focus-within:bg-background focus-within:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_28px_-14px_rgba(58,2,3,0.32)]">
        <Search className="h-4 w-4 shrink-0 text-primary/70" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={compact ? "Search jewelry, collections…" : "Search for jewelry, collections and more"}
          aria-label="Search products"
          className="min-w-0 flex-1 bg-transparent px-1 text-[13.5px] outline-none placeholder:text-muted-foreground/60"
        />
        <button
          type="submit"
          className="inline-flex h-9 shrink-0 items-center rounded-full bg-primary px-5 text-[12px] font-semibold uppercase tracking-[0.08em] text-primary-foreground shadow-sm hover:brightness-110 active:scale-[0.98] transition"
        >
          Search
        </button>
      </div>
    </form>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-md">
      {/* Mobile */}
      <div className="md:hidden">
        <div className="container-page flex h-14 items-center justify-between gap-3">
          <Link to="/" aria-label="Home" className="shrink-0">
            <Logo size={26} />
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <Link
              to="/products"
              aria-label="Wishlist"
              className="grid h-9 w-9 place-items-center rounded-full text-foreground/80 hover:bg-primary/[0.06] hover:text-primary transition-colors"
            >
              <Heart className="h-[18px] w-[18px]" />
            </Link>
            <Link
              to="/cart"
              aria-label="Cart"
              className="relative grid h-9 w-9 place-items-center rounded-full text-foreground/80 hover:bg-primary/[0.06] hover:text-primary transition-colors"
            >
              <ShoppingBag className="h-[18px] w-[18px]" />
              {cartCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              )}
            </Link>
          </div>
        </div>
        <div className="container-page pb-3 pt-0.5">
          <SearchPill compact />
          <div className="mt-2.5 flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Popular</span>
            <div className="flex flex-1 gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {QUICK.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => goTerm(t)}
                  className="shrink-0 rounded-full border border-border/80 bg-background px-3 py-1 text-[11.5px] font-medium text-foreground/80 hover:border-primary/60 hover:bg-primary/[0.04] hover:text-primary transition-colors"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop */}
      <div className="container-page hidden h-20 items-center gap-6 md:flex">
        <Link to="/" aria-label="Home" className="shrink-0">
          <Logo size={32} />
        </Link>
        <div className="flex max-w-2xl flex-1 items-center">
          <SearchPill />
        </div>
        <nav className="flex items-center gap-1" aria-label="Account">
          <Link
            to="/products"
            preload="intent"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-foreground/80 hover:bg-primary/[0.06] hover:text-primary transition-colors"
            aria-label="Wishlist"
          >
            <Heart className="h-[18px] w-[18px]" />
          </Link>
          <Link
            to="/auth"
            preload="intent"
            className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-foreground/80 hover:bg-primary/[0.06] hover:text-primary transition-colors"
          >
            <User className="h-4 w-4" />
            <span>Account</span>
          </Link>
          <Link
            to="/cart"
            preload="intent"
            className="relative ml-1 inline-flex h-10 items-center gap-1.5 rounded-full bg-primary/[0.06] px-3.5 text-[13px] font-semibold text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
            aria-label="Cart"
          >
            <ShoppingBag className="h-4 w-4" />
            <span>Cart</span>
            {cartCount > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background">
                {cartCount}
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}
