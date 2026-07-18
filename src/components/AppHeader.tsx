import { Link } from "@tanstack/react-router";
import { useSession, useRoles, isStaff } from "@/lib/auth-helpers";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShoppingBag, LayoutDashboard, LogOut, Search, User } from "lucide-react";
import { useCart } from "@/lib/cart";

export function AppHeader() {
  const { user } = useSession();
  const { data: roles } = useRoles();
  const staff = isStaff(roles);
  const { count } = useCart();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
        <Link to="/" className="font-display text-2xl font-medium tracking-wide">
          Zonash
        </Link>
        <nav className="hidden gap-6 text-sm tracking-wide text-muted-foreground md:flex">
          <Link to="/" className="hover:text-foreground [&.active]:text-foreground">Home</Link>
          <Link to="/products" className="hover:text-foreground [&.active]:text-foreground">Shop</Link>
          <Link to="/categories" className="hover:text-foreground [&.active]:text-foreground">Collections</Link>
          {user && (
            <Link to="/account/orders" className="hover:text-foreground [&.active]:text-foreground">My orders</Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Link to="/products" aria-label="Search">
            <Button variant="ghost" size="icon"><Search className="h-4 w-4" /></Button>
          </Link>
          {staff && (
            <Link to="/admin">
              <Button variant="outline" size="sm" className="hidden gap-2 sm:inline-flex">
                <LayoutDashboard className="h-4 w-4" /> Admin
              </Button>
            </Link>
          )}
          {user ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => { await supabase.auth.signOut(); window.location.href = "/"; }}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          ) : (
            <Link to="/auth" aria-label="Sign in">
              <Button variant="ghost" size="icon"><User className="h-4 w-4" /></Button>
            </Link>
          )}
          <Link to="/cart" aria-label="Cart" className="relative">
            <Button variant="ghost" size="icon">
              <ShoppingBag className="h-4 w-4" />
            </Button>
            {count > 0 && (
              <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {count}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
